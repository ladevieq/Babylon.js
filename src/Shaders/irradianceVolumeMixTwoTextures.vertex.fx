
attribute vec2 uv;
attribute vec2 uv2;

varying vec2 vUV;
varying vec2 vUV2;


void main( void )
{
    vUV = uv;
    vUV2 = uv2;
    gl_Position = vec4(uv2 * 2. - 1., 0.0, 1.0);

}