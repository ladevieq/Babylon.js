import { Mesh } from "../Meshes/mesh";
import { VertexBuffer } from "../Meshes/buffer";
import { SubMesh } from "../Meshes/subMesh";
import { Scene } from "../scene";
import { Texture } from "../Materials/Textures/texture";
import { InternalTexture } from "../Materials/Textures/internalTexture";
import { RenderTargetTexture } from "../Materials/Textures/renderTargetTexture";
import { MultiRenderTarget } from "../Materials/Textures/multiRenderTarget";
import { Effect } from "../Materials/effect";
import { Material } from "../Materials/material";
// import { StandardMaterial } from "../Materials/standardMaterial";
import { Constants } from "../Engines/constants";
import { ISize, Vector2, Vector3, Color4, Matrix } from "../Maths/math";
import { DirectEffectsManager } from "./directEffectManager";

declare module "../Meshes/mesh" {
    export interface Mesh {
        /** Object containing radiosity information for this mesh */
        directInfo: {
            /** Size of the lightmap texture */
            shadowMapSize: {
                width: number,
                height: number
            };

            shadowMap: Texture;
            tempTexture: Texture;
        };

        /** Inits the `directInfo` object */
        initForDirect(shadowMapSize: { width: number, height: number }, scene: Scene): void;

        /** Gets radiosity texture
         * @return the radiosity texture. Can be fully black if the radiosity process has not been run yet.
         */
        getShadowMap(): Texture;
    }
}

Mesh.prototype.initForDirect = function(shadowMapSize: { width: number, height: number }, scene: Scene) {
    const mrt = new MultiRenderTarget(
        "mesh-textures",
        shadowMapSize,
        2,
        scene,
        {
            generateMipMaps: false,
            samplingModes: [Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURE_BILINEAR_SAMPLINGMODE],
            types: [Constants.TEXTURETYPE_FLOAT, Constants.TEXTURETYPE_FLOAT ],
        }
    );

    this.directInfo = {
        shadowMapSize,
        shadowMap: mrt.textures[0],
        tempTexture: mrt.textures[1],
    };
};

Mesh.prototype.getShadowMap = function() {
    return this.directInfo.shadowMap;
};

declare interface ArealightOptions {
    sampleCount: number;
    bias: number;
    normalBias: number;
}

export class Arealight {
    public position: Vector3;

    public normal: Vector3;

    public radius: number;

    public size: ISize = {
        width: 60,
        height: 180,
    };

    public depthMapSize: {
        width: number,
        height: number
    };

    public depthMap: RenderTargetTexture;

    // Samples world positions
    public samples: Vector3[];

    public sampleIndex: number = 0;

    public bias: number;

    public normalBias: number;

    constructor(position: Vector3, normal: Vector3, size: ISize, depthMapSize: { width: number, height: number }, lightOptions: ArealightOptions, scene: Scene) {
        this.position = position.clone();
        this.normal = normal.clone().normalize();
        this.size = size;
        this.bias = lightOptions.bias;
        this.normalBias = lightOptions.normalBias;
        this.depthMapSize = depthMapSize;

        this.depthMap = new RenderTargetTexture(
            "depthMap",
            this.depthMapSize,
            scene,
            false,
            true,
            Constants.TEXTURETYPE_FLOAT,
            true,
            Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
            true,
            false
        );

        this._generateSamples(lightOptions.sampleCount);

        // for (const sample of this.samples) {
        //     const mat = new StandardMaterial("", scene);
        //     mat.emissiveColor = new Color3(1, 0, 0);
        //     const box = Mesh.CreateBox("", 1.5, scene);
        //     box.position = sample;
        //     box.material = mat;
        // }
    }

    private _generateSamples(sampleCount: number) {
        this.samples = [];

        const viewMatrix = Matrix.LookAtLH(this.position, this.position.add(this.normal), Vector3.Up());
        viewMatrix.invert();

        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
            const [u, v] = this.sampleRectangle(sampleIndex);
            const x = u * this.size.width;
            const y = v * this.size.height;

            const localPosition = new Vector3(x, y, 0);
            const worldPosition = Vector3.TransformCoordinates(localPosition, viewMatrix);
            this.samples.push(worldPosition);
        }
    }

    // Blender approach for arealights samples generation
    private sampleRectangle(sampleIndex: number) {
        const htOffset = [0.0, 0.0];
        const htPrimes = [2, 3];

        let htPoint = this.halton2d(htPrimes, htOffset, sampleIndex);

        /* Decorelate AA and shadow samples. (see T68594) */
        htPoint[0] = htPoint[0] * 1151.0 % 1.0;
        htPoint[1] = htPoint[1] * 1069.0 % 1.0;

        /* Change ditribution center to be 0,0 */
        htPoint[0] = htPoint[0] > 0.5 ? htPoint[0] - 1 : htPoint[0];
        htPoint[1] = htPoint[1] > 0.5 ? htPoint[1] - 1 : htPoint[1];

        return htPoint;
    }

    private haltonEx(invprimes: number, offset: number): number
    {
        const e = Math.abs((1.0 - offset) - 1e-10);

      if (invprimes >= e) {
        let lasth;
        let h = invprimes;

        do {
          lasth = h;
          h *= invprimes;
        } while (h >= e);

        return offset + ((lasth + h) - 1.0);
      }
      else {
        return offset + invprimes;
      }
    }

    private halton2d(prime: number[], offset: number[], n: number): number[]
    {
        const invprimes = [1.0 / prime[0], 1.0 / prime[1]];
        const r = [0, 0];

        for (let s = 0; s < n; s++) {
            for (let i = 0; i < 2; i++) {
              r[i] = offset[i] = this.haltonEx(invprimes[i], offset[i]);
            }
        }

        return r;
    }
}

declare interface DirectRendererOptions {
    near?: number;
    far?: number;
}

/**
 * Radiosity Renderer
 * Creates patches from uv-mapped (lightmapped) geometry.
 * Renders hemicubes or spheres from patches
 * Shoots light from emissive patches
 * Can be used as direct light baking, or radiosity light baking solution
 */
export class DirectRenderer {
    /**
     * Meshes involved in the radiosity solution process. Scene meshes that are not in this list will be ignored,
     * and therefore will not occlude or receive radiance.
     */
    public meshes: Mesh[];

    public lights: Arealight[];

    public renderingPromise: Promise<void>;

    private _frambuffer0: WebGLFramebuffer;

    private _options: DirectRendererOptions;
    /**
     * Verbosity level for performance of the renderer
     * Accepted values are 0, 1, 2 or 3
     */
    public static PERFORMANCE_LOGS_LEVEL: number = 1;
    /**
     * Verbosity level for information about current radiosity solving
     * Accepted values are 0, 1 or 2
     */
    public static RADIOSITY_INFO_LOGS_LEVEL: number = 1;
    /**
     * Verbosity level for warnings
     * Accepted values are 0 or 1
     */
    public static WARNING_LOGS: number = 1;

    private _scene: Scene;

    private _near: number;
    private _far: number;

    private _projectionMatrix: Matrix;
    private _projectionMatrixPX: Matrix;
    private _projectionMatrixNX: Matrix;
    private _projectionMatrixPY: Matrix;
    private _projectionMatrixNY: Matrix;

    private _directEffectsManager: DirectEffectsManager;

    public get far(): number {
        return this._far;
    }
    
    public set far(newFar: number) {
        this._far = newFar;

        this.recomputeMatrices();
    }

    /**
     * Instanciates a radiosity renderer
     * @param scene The current scene
     * @param meshes The meshes to include in the radiosity solver
     */
    constructor(scene: Scene, meshes?: Mesh[], lights?: Arealight[], options?: DirectRendererOptions) {
        this._options = options || {};
        this._scene = scene;
        this._near = this._options.near || 0.1;
        this._far = this._options.far || 10000;
        this.meshes = meshes || [];
        this.lights = lights || [];

        this.recomputeMatrices();

        const engine = this._scene.getEngine();
        const gl = engine._gl;
        this._frambuffer0 = <WebGLFramebuffer>gl.createFramebuffer();

        this._directEffectsManager = new DirectEffectsManager(this._scene);

        while (!this._directEffectsManager.isReady()) {
        }
    }

    public recomputeMatrices() {
        this._projectionMatrix = Matrix.PerspectiveFovLH(
            Math.PI / 2,
            1, // squared texture
            this._near,
            this._far,
        );

        this._projectionMatrixPX = this._projectionMatrix.multiply(Matrix.FromValues(
            2, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            1, 0, 0, 1
        ));

        this._projectionMatrixNX = this._projectionMatrix.multiply(Matrix.FromValues(
             2, 0, 0, 0,
             0, 1, 0, 0,
             0, 0, 1, 0,
            -1, 0, 0, 1
        ));

        this._projectionMatrixPY = this._projectionMatrix.multiply(Matrix.FromValues(
            1, 0, 0, 0,
            0, 2, 0, 0,
            0, 0, 1, 0,
            0, 1, 0, 1
        ));

        this._projectionMatrixNY = this._projectionMatrix.multiply(Matrix.FromValues(
            1,  0, 0, 0,
            0,  2, 0, 0,
            0,  0, 1, 0,
            0, -1, 0, 1
        ));
    }

    public renderNextSample() {
        const light = this.lights.slice().sort((light1, light2) => {
            if (light1.sampleIndex === light1.samples.length - 1
                && light2.sampleIndex === light2.samples.length - 1) {
                return 0;
            }
            else if (light1.sampleIndex === light1.samples.length - 1) {
                return -1;
            }
            else if (light2.sampleIndex === light2.samples.length - 1) {
                return -1;
            }

            return light1.sampleIndex - light2.sampleIndex;
        })[0];
        const sampleIndex = light.sampleIndex;

        this.renderVisibilityMapCubeSample(light, light.samples[sampleIndex]);

        this.renderSampleToShadowMapTexture(light, light.samples[sampleIndex]);
    }

    public render() {
        for (const light of this.lights) {
            for (const sample of light.samples) {
                this.renderVisibilityMapCubeSample(light, sample);

                this.renderSampleToShadowMapTexture(light, sample);
            }
        }

        this.postProcesses();
    }

    public postProcesses() {
        for (const mesh of this.meshes) {
            this.dilate(mesh.directInfo.shadowMap, mesh.directInfo.tempTexture);

            this.blur(mesh.directInfo.tempTexture, mesh.directInfo.shadowMap, false);
            this.blur(mesh.directInfo.shadowMap, mesh.directInfo.tempTexture);

            const temp = mesh.directInfo.shadowMap._texture;
            mesh.directInfo.shadowMap._texture = mesh.directInfo.tempTexture._texture;
            mesh.directInfo.tempTexture._texture = temp;

            // this.dilate(mesh.directInfo.tempTexture, mesh.directInfo.shadowMap);
        }
    }

    private renderSampleToShadowMapTexture(light: Arealight, samplePosition: Vector3) {
        const viewMatrix = Matrix.LookAtLH(samplePosition, samplePosition.add(light.normal), Vector3.Up());
        const engine = this._scene.getEngine();
        const gl = engine._gl;
        const effect = this._directEffectsManager.shadowMappingEffect;

        for (const mesh of this.meshes) {
            engine.enableEffect(effect);
            effect.setTexture("depthMap", light.depthMap);
            effect.setMatrix("view", viewMatrix);
            effect.setFloat2("nearFar", this._near, this._far);
            effect.setVector3("lightPos", samplePosition);
            effect.setFloat("sampleCount", light.samples.length);
            effect.setTexture("gatherTexture", mesh.directInfo.shadowMap);

            // Rendering shadow to tempTexture
            engine.setDirectViewport(0, 0, mesh.directInfo.shadowMapSize.width, mesh.directInfo.shadowMapSize.height);
            engine.setState(mesh!.material!.backFaceCulling, 0, true, true);

            gl.bindFramebuffer(gl.FRAMEBUFFER, this._frambuffer0);
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, <WebGLTexture>mesh.directInfo.tempTexture!._texture!._webGLTexture, 0);

            for (const subMesh of mesh.subMeshes) {
                var batch = mesh._getInstancesRenderList(subMesh._id);

                if (batch.mustReturn) {
                    return;
                }

                var hardwareInstancedRendering = Boolean(engine.getCaps().instancedArrays && batch.visibleInstances[subMesh._id]);
                mesh._bind(subMesh, this._directEffectsManager.shadowMappingEffect, Material.TriangleFillMode);
                mesh._processRendering(mesh, subMesh, this._directEffectsManager.shadowMappingEffect, Material.TriangleFillMode, batch, hardwareInstancedRendering,
                    (isInstance, world) => this._directEffectsManager.shadowMappingEffect.setMatrix("world", world));
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);

            // Swap temp and shadow texture
            const temp = mesh.directInfo.tempTexture;
            mesh.directInfo.tempTexture = mesh.directInfo.shadowMap;
            mesh.directInfo.shadowMap = temp;
        }
    }

    public dilate(origin: Texture, dest: Texture) {
        const engine = this._scene.getEngine();
        const gl = engine._gl;
        const effect = this._directEffectsManager.dilateEffect;
        engine.enableEffect(effect);
        engine.setState(false);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._frambuffer0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, <WebGLTexture>dest!._texture!._webGLTexture, 0);

        let vb: any = {};
        vb[VertexBuffer.PositionKind] = this._directEffectsManager.screenQuadVB;
        effect.setTexture("inputTexture", origin);
        effect.setFloat2("texelSize", 1 / dest.getSize().width, 1 / dest.getSize().height);
        engine.bindBuffers(vb, this._directEffectsManager.screenQuadIB, effect);

        engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
        engine.drawElementsType(Material.TriangleFillMode, 0, 6);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Checks if the renderer is ready
     * @returns True if the renderer is ready
     */
    public isReady() {
        return this._directEffectsManager.isReady();
    }

    public isRenderFinished() {
        return this.lights.every((light) => light.sampleIndex === light.samples.length);
    }

    public toneMap(origin: Texture, dest: Texture) {
        const engine = this._scene.getEngine();
        const effect = this._directEffectsManager.radiosityPostProcessEffect;
        engine.enableEffect(effect);
        engine.setState(false);
        engine.bindFramebuffer(<InternalTexture>dest._texture);

        let vb: any = {};
        vb[VertexBuffer.PositionKind] = this._directEffectsManager.screenQuadVB;
        effect.setTexture("inputTexture", origin);
        effect.setFloat("exposure", 2);
        engine.bindBuffers(vb, this._directEffectsManager.screenQuadIB, effect);

        engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
        engine.drawElementsType(Material.TriangleFillMode, 0, 6);

        engine.unBindFramebuffer(<InternalTexture>dest._texture);
    }

    public blur(origin: Texture, dest: Texture, horizontal: boolean = true) {
        const engine = this._scene.getEngine();
        const gl = engine._gl;
        const effect = horizontal ? this._directEffectsManager.horizontalBlurEffect : this._directEffectsManager.verticalBlurEffect;
        engine.enableEffect(effect);
        engine.setState(false);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._frambuffer0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, <WebGLTexture>dest!._texture!._webGLTexture, 0);

        let vb: any = {};
        vb[VertexBuffer.PositionKind] = this._directEffectsManager.screenQuadVB;
        effect.setTexture("inputTexture", origin);
        effect.setVector2("texelSize", Vector2.One().divide(new Vector2(origin.getSize().width, origin.getSize().height)));
        engine.bindBuffers(vb, this._directEffectsManager.screenQuadIB, effect);

        engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
        engine.drawElementsType(Material.TriangleFillMode, 0, 6);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private renderSubMesh = (subMesh: SubMesh, effect: Effect) => {
        let engine = this._scene.getEngine();
        let mesh = subMesh.getRenderingMesh();
        let material = subMesh.getMaterial();

        if (!material || subMesh.verticesCount === 0) {
            return;
        }

        mesh._bind(subMesh, effect, Material.TriangleFillMode);
        engine.setState(material.backFaceCulling);

        var batch = mesh._getInstancesRenderList(subMesh._id);

        if (batch.mustReturn) {
            return;
        }

        // Draw triangles
        const hardwareInstancedRendering = Boolean(engine.getCaps().instancedArrays && batch.visibleInstances[subMesh._id]);
        mesh._processRendering(mesh, subMesh, effect, Material.TriangleFillMode, batch, hardwareInstancedRendering,
            (isInstance, world) => effect.setMatrix("world", world));
    }

    private _setCubeVisibilityUniforms(effect: Effect, view: Matrix, projection: Matrix) {
        effect.setMatrix("view", view);
        effect.setMatrix("projection", projection);
        effect.setFloat2("nearFar", this._near, this._far);
    }

    private renderVisibilityMapCubeSample(light: Arealight, samplePosition: Vector3) {
        const engine = this._scene.getEngine();
        const gl = engine._gl;

        const viewMatrix = Matrix.LookAtLH(samplePosition, samplePosition.add(light.normal), Vector3.Up());
        let xAxis = new Vector3(viewMatrix.m[0], viewMatrix.m[4], viewMatrix.m[8]); // Tangent
        let yAxis = new Vector3(viewMatrix.m[1], viewMatrix.m[5], viewMatrix.m[9]); // "Up"
        let zAxis = new Vector3(viewMatrix.m[2], viewMatrix.m[6], viewMatrix.m[10]); // depth

        const viewMatrixPX = Matrix.LookAtLH(samplePosition, samplePosition.add(xAxis), yAxis);
        const viewMatrixNX = Matrix.LookAtLH(samplePosition, samplePosition.subtract(xAxis), yAxis);
        const viewMatrixPY = Matrix.LookAtLH(samplePosition, samplePosition.add(yAxis), zAxis.scale(-1));
        const viewMatrixNY = Matrix.LookAtLH(samplePosition, samplePosition.subtract(yAxis), zAxis);

        const viewMatrices = [
            viewMatrix,
            viewMatrixPX,
            viewMatrixNX,
            viewMatrixPY,
            viewMatrixNY
        ];

        const projectionMatrices = [
            this._projectionMatrix,
            this._projectionMatrixPX,
            this._projectionMatrixNX,
            this._projectionMatrixPY,
            this._projectionMatrixNY
        ];

        const viewportMultipliers = [
            [1, 1],
            [0.5, 1],
            [0.5, 1],
            [1, 0.5],
            [1, 0.5],
        ];

        const viewportOffsets = [
            [0, 0],
            [0, 0],
            [0.5, 0],
            [0, 0],
            [0, 0.5],
        ];

        const cubeSides = [
            gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
            gl.TEXTURE_CUBE_MAP_POSITIVE_X,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
        ];

        engine.enableEffect(this._directEffectsManager.visibilityEffect);

        // Hemi cube rendering
        for (let viewIndex = 0; viewIndex < cubeSides.length; viewIndex++) {
            // Render on each face of the hemicube
            engine.bindFramebuffer(<InternalTexture>light.depthMap._texture, cubeSides[viewIndex] - gl.TEXTURE_CUBE_MAP_POSITIVE_X);

            // Full cube viewport when rendering the front face
            engine.setDirectViewport(
                viewportOffsets[viewIndex][0] * light.depthMapSize.width,
                viewportOffsets[viewIndex][1] * light.depthMapSize.height,
                light.depthMapSize.width * viewportMultipliers[viewIndex][0],
                light.depthMapSize.height * viewportMultipliers[viewIndex][1]
            );

            engine.clear(new Color4(0, 0, 0, 0), true, true);

            this._setCubeVisibilityUniforms(this._directEffectsManager.visibilityEffect, viewMatrices[viewIndex], projectionMatrices[viewIndex]);
            this._directEffectsManager.visibilityEffect.setVector3("lightPos", samplePosition);
            this._directEffectsManager.visibilityEffect.setFloat("bias", light.bias);
            this._directEffectsManager.visibilityEffect.setFloat("normalBias", light.normalBias);

            for (const mesh of this.meshes) {
                for (const subMesh of mesh.subMeshes) {
                    this.renderSubMesh(subMesh, this._directEffectsManager.visibilityEffect);
                }
            }

            engine.unBindFramebuffer(<InternalTexture>light.depthMap._texture);
        }

        light.sampleIndex = light.samples.indexOf(samplePosition) + 1;
    }

    /**
     * Disposes of the radiosity renderer.
     */
    public dispose(): void {
    }
}
