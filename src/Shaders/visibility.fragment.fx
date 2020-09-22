// Uniforms
uniform vec2 nearFar;
uniform float bias;

const float depthScale = 50.0;

#ifdef ALPHA
uniform sampler2D alphaTexture;
#endif

// Inputs
in vec4 vDepthMetric;
in float vDepthMetricSM;
in vec2 vUV;

void main(void) {
    float depth = (vDepthMetric.z / vDepthMetric.w) + bias;
    // float depth = clamp(exp(-min(87., depthScale * vDepthMetricSM)), 0., 1.);

    float alpha = 1.0;

#ifdef ALPHA
    alpha = texture(alphaTexture, vUV).a;

    if (alpha < 0.4) {
        discard;
    }
#endif

    gl_FragColor = vec4(depth, 0.0, 0.0, 1.0);

    // Debug
    // gl_FragColor = vec4(depth / nearFar.y, 0.0, 0.0, 1.0);
}
