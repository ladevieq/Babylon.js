uniform sampler2D textureSampler;
uniform sampler2D directSampler;
uniform float globalIllumStrength;
uniform float directIllumStrength;

in vec2 vUV;

void main ( void ) {
    vec3 globalColor = texture(textureSampler, vUV).rgb + vec3(0.5);

    vec3 sumColor = texture(directSampler, vUV).rgb  * directIllumStrength + globalColor * globalIllumStrength;
    gl_FragColor = vec4(sumColor, 1.);
}
