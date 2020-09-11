// Attributes
in vec2 vUV;
uniform sampler2D inputTexture;
uniform float exposure;

float gamma = 2.2;

void main(void) {
    vec3 color = vec3(0.01) + texture2D(inputTexture, vUV).rgb;

    vec3 mapped = vec3(1.0) - exp(-color * exposure);
    color = pow(mapped, vec3(1.0 / gamma));

    gl_FragColor = vec4(color.rgb, 1.0);
}
