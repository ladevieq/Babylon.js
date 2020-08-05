uniform sampler2D inputTexture;

// Parameters
uniform vec2 texelSize;

in vec2 vUV;

void main(void)
{
	// float weights[13];
	// weights[0] = 0.00625;
	// weights[1] = 0.0125;
	// weights[2] = 0.025;
	// weights[3] = 0.05;
	// weights[4] = 0.1;
	// weights[5] = 0.2;
	// weights[6] = 0.3;
	// weights[7] = 0.2;
	// weights[8] = 0.1;
	// weights[9] = 0.05;
	// weights[10] = 0.025;
	// weights[11] = 0.0125;
	// weights[12] = 0.00625;

	float weights[7];
	weights[0] = 0.05;
	weights[1] = 0.1;
	weights[2] = 0.2;
	weights[3] = 0.3;
	weights[4] = 0.2;
	weights[5] = 0.1;
	weights[6] = 0.05;

	vec2 start = vUV - vec2(0.0, 3.0 * texelSize.y);
	vec2 texelOffset = vec2(0.0, texelSize.y);

	vec4 baseColor = vec4(0.0);

	for (int i = 0; i < 7; i++)
	{
		baseColor += texture2D(inputTexture, start + texelOffset * float(i)) * weights[i];
	}

	gl_FragColor = baseColor;
}
