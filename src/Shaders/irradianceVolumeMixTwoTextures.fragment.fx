uniform sampler2D textureSampler;
uniform sampler2D directSampler;
uniform float globalIllumStrength;
uniform float directIllumStrength;

in vec2 vUV;

void main ( void ) {
    vec3 sumColor = texture(directSampler, vUV).rgb  * directIllumStrength +  texture(textureSampler, vUV).rgb * globalIllumStrength;
    gl_FragColor = vec4(sumColor, 1.);
}
