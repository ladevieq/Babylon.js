#version 300 es

layout(location = 0) out vec4 glFragColor;

// Attributes
// in vec4 vLightSpacePos;
in vec3 vWorldPos;    // world pos of receiving element
in vec3 vWorldNormal; // world normal of receiving element
in vec2 vUV2;

uniform samplerCube depthMap;
uniform sampler2D gatherTexture;

uniform vec3 lightPos;
uniform vec2 nearFar;
uniform float sampleCount;

uniform mat4 view;

const float depthScale = 50.0;
vec3 worldNormal;

void main(void) {
    worldNormal = normalize(vWorldNormal);

    vec3 directionToLight = vec3(view * vec4(vWorldPos, 1.0)).xyz * vec3(1.0, -1.0, 1.0);
    vec3 absDir = abs(directionToLight);
    float depth = max(max(absDir.x, absDir.y), absDir.z);
    float farMinusNear = nearFar.y - nearFar.x;
    depth = ((nearFar.y + nearFar.x) - 2.0 * nearFar.y * nearFar.x / depth) / farMinusNear;

    float sampledDepth = texture(depthMap, directionToLight).r;
    // float esm = 1.0 - clamp(exp(min(87., depthScale * depth)) * sampledDepth, 0., 1.);
    // float visible = esm / sampleCount;
    // float visible = step(depth * depthScale, sampledDepth) / sampleCount;

    float gather = texture(gatherTexture, vUV2).x;

    float visible = step(depth, sampledDepth) / sampleCount;
    // float visible = depth / nearFar.y;
    // float visible = sampledDepth / nearFar.y;

    // glFragColor = vec4(visible, visible, visible, 1.0);

    // Gathering mode
    glFragColor = vec4(gather + visible, gather + visible, gather + visible, 1.0);
}
