// Attributes
in vec3 position;
in vec3 normal;

// Uniforms
uniform mat4 projection;
uniform mat4 view;
uniform mat4 world;

uniform vec3 lightPos;

uniform float bias;
uniform float normalBias;

uniform vec2 nearFar;

// Outputs
out vec4 vDepthMetric;
out float vDepthMetricSM;

void main(void) {
    vec4 worldPos = world * vec4(position, 1.0);
    vec3 vWorldNormal = normalize((world * vec4(normal, 1.0)).xyz);

    vec3 directionToLightSM = lightPos.xyz - worldPos.xyz;
    vec3 worldLightDirSM = normalize(directionToLightSM);

    float ndlSM = dot(vWorldNormal, worldLightDirSM);
    float sinNLSM = sqrt(1.0 - ndlSM * ndlSM);
    float normalBiasSM = normalBias * sinNLSM;

    worldPos.xyz -= vWorldNormal * normalBiasSM;

    vec4 viewPos = projection * view * worldPos;
    gl_Position = viewPos;
    // gl_Position.z += bias * gl_Position.w;
    vDepthMetricSM = ((gl_Position.z + nearFar.x) / (nearFar.x + nearFar.y)) + bias;
    vDepthMetric = viewPos;
}
