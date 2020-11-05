#version 300 es

layout(location = 0) out vec4 glFragColor;

// Attributes
in vec3 vWorldPos;    // world pos of receiving element
in vec3 vWorldNormal; // world normal of receiving element
in vec2 vUV2;

uniform samplerCube depthMap;
uniform sampler2D gatherTexture;

uniform vec3 lightPos;
uniform float radius;
uniform float intensity;
uniform vec2 nearFar;
uniform float sampleCount;

uniform mat4 view;

void main(void) {
    vec3 worldNormal = normalize(vWorldNormal);

    vec3 directionToLight = vec3(view * vec4(vWorldPos, 1.0)).xyz * vec3(1.0, -1.0, 1.0);
    vec3 absDir = abs(directionToLight);
    float depth = max(max(absDir.x, absDir.y), absDir.z);
    float farMinusNear = nearFar.y - nearFar.x;
    depth = ((nearFar.y + nearFar.x) - 2.0 * nearFar.y * nearFar.x / depth) / farMinusNear;

    float distance = length(lightPos - vWorldPos);
    float falloff = pow(clamp(1.0 - pow(distance / radius, 4.0), 0.0, 1.0), 2.0) / (distance * distance + 1.0);
    float sampledDepth = texture(depthMap, directionToLight).r;

    float gather = texture(gatherTexture, vUV2).x;

    float visible = (step(depth, sampledDepth) * intensity * falloff) / sampleCount;

    // Gathering mode
    glFragColor = vec4(gather + visible, gather + visible, gather + visible, 1.0);
}
