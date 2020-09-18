// Uniforms
uniform vec2 nearFar;
uniform float bias;

const float depthScale = 50.0;

// Inputs
in vec4 vDepthMetric;
in float vDepthMetricSM;

void main(void) {
    float depth = (vDepthMetric.z / vDepthMetric.w) + bias;
    // float depth = clamp(exp(-min(87., depthScale * vDepthMetricSM)), 0., 1.);

    gl_FragColor = vec4(depth, 0.0, 0.0, 1.0);

    // Debug
    // gl_FragColor = vec4(depth / nearFar.y, 0.0, 0.0, 1.0);
}
