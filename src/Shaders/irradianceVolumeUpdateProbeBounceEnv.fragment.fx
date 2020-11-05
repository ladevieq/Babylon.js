varying vec3 wPosition;
varying vec3 wNormal;
varying vec2 vUV;
varying vec2 vUV2;

uniform vec3 probePosition;
uniform vec3 albedoColor;
uniform bool hasTexture;
uniform sampler2D albedoTexture;
uniform float envMultiplicator;

uniform sampler2D irradianceMap;
uniform sampler2D directIlluminationLightmap;


void main ( void ) {

    vec3 vector = wPosition - probePosition;
    vec4 diffuseColor;

    if (hasTexture) {
        diffuseColor = vec4(texture(albedoTexture, vUV));
    }
    else {
        diffuseColor = vec4(albedoColor, 1.);
    }

    vec4 irradiance = texture(irradianceMap, vUV2);
    vec4 directIllumination = clamp(texture(directIlluminationLightmap, vUV2) * envMultiplicator, 0., 1.);


    gl_FragColor = (irradiance + directIllumination ) * diffuseColor;
   
}
