// Attributes
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec2 uv2;

uniform mat4 world;

out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec2 vUV;
out vec2 vUV2;

void main(void) {
    vWorldPos = vec3(world * vec4(position, 1.0));
    vWorldNormal = (world * vec4(normal, 1.0)).xyz;
    vUV = uv;
    vUV2 = uv2;
    gl_Position = vec4(vUV2 * 2.0 - 1.0, 0.0, 1.0);
}
