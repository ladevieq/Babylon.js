import { Mesh } from "../Meshes/mesh";
import { SubMesh } from "../Meshes/subMesh";
import { Scene } from "../scene";
import { Texture } from "../Materials/Textures/texture";
import { InternalTexture } from "../Materials/Textures/internalTexture";
import { RenderTargetTexture } from "../Materials/Textures/renderTargetTexture";
import { Effect } from "../Materials/effect";
import { Material } from "../Materials/material";

import { PostProcess } from "../PostProcesses/postProcess";
import { BlurPostProcess } from "../PostProcesses/blurPostProcess";
// import { TonemapPostProcess, TonemappingOperator } from "../PostProcesses/tonemapPostProcess";
import { Constants } from "../Engines/constants";
import { VertexBuffer } from "../Meshes/buffer";

import { StandardMaterial } from "../Materials/standardMaterial";
import { ISize, Vector2, Vector3, Color3, Color4, Matrix } from "../Maths/math";
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

            // shadowMap: Texture;
            // tempTexture: Texture;
            shadowMap: RenderTargetTexture;
            tempTexture: RenderTargetTexture;
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
    this.directInfo = {
        shadowMapSize,
        shadowMap: new RenderTargetTexture("shadowMap", shadowMapSize, scene, false, true, Constants.TEXTURETYPE_FLOAT, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, false, false),
        tempTexture: new RenderTargetTexture("tempMap", shadowMapSize, scene, false, true, Constants.TEXTURETYPE_FLOAT, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, false, false),
    };
};

Mesh.prototype.getShadowMap = function() {
    return this.directInfo.shadowMap;
};

declare interface ArealightOptions {
    sampleCount: number;
    bias: number;
    normalBias: number;
    depthMapSize: { width: number, height: number };
    near: number;
    far: number;
}

export class Arealight {
    public position: Vector3;

    public normal: Vector3;

    public radius: number;

    public size: ISize;

    public depthMapSize: {
        width: number,
        height: number
    };

    public depthMap: RenderTargetTexture;

    public sampleCount: number;

    // Samples world positions
    public samples: Vector3[];

    public sampleIndex: number;

    public bias: number;

    public normalBias: number;

    private _near: number;

    public get near(): number {
        return this._near;
    }

    public set near(newNear: number) {
        this._near = newNear;

        this._updateMatrices();
    }

    private _far: number;

    public get far(): number {
        return this._far;
    }

    public set far(newFar: number) {
        this._far = newFar;

        this._updateMatrices();
    }

    /**
     * Hemicube projection matrices
     */
    private _projectionMatrix: Matrix;

    public get projectionMatrix(): Matrix {
        return this._projectionMatrix;
    }

    private _projectionMatrixPX: Matrix;

    public get projectionMatrixPX(): Matrix {
        return this._projectionMatrixPX;
    }

    private _projectionMatrixNX: Matrix;

    public get projectionMatrixNX(): Matrix {
        return this._projectionMatrixNX;
    }

    private _projectionMatrixPY: Matrix;

    public get projectionMatrixPY(): Matrix {
        return this._projectionMatrixPY;
    }

    private _projectionMatrixNY: Matrix;

    public get projectionMatrixNY(): Matrix {
        return this._projectionMatrixNY;
    }

    constructor(position: Vector3, normal: Vector3, size: ISize, arealightOptions: ArealightOptions, scene: Scene) {
        this.position = position.clone();
        this.normal = normal.clone().normalize();
        this.size = size;
        this.sampleCount = arealightOptions.sampleCount || 64;
        this.bias = arealightOptions.bias || 1e-5;
        this.normalBias = arealightOptions.normalBias || 1e-5;
        this.near = arealightOptions.near || 0.1;
        this.far = arealightOptions.far || 10000;
        this.depthMapSize = arealightOptions.depthMapSize ||
            {
                width: 512,
                height: 512
            };
        this.sampleIndex = 0;

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
            false,
            false,
            Constants.TEXTUREFORMAT_R
        );

        this._updateMatrices();
        this._generateSamples(arealightOptions.sampleCount);

        for (const sample of this.samples) {
            const mat = new StandardMaterial("", scene);
            mat.emissiveColor = new Color3(1, 0, 0);
            const box = Mesh.CreateBox("", 1.5, scene);
            box.position = sample;
            box.material = mat;
        }
    }

    private _generateSamples(sampleCount: number) {
        this.samples = [];

        const viewMatrix = Matrix.LookAtLH(this.position, this.position.add(this.normal), Vector3.Up());
        viewMatrix.invert();

        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
            const [u, v] = this._sampleRectangle(sampleIndex);
            const x = u * this.size.width;
            const y = v * this.size.height;

            const localPosition = new Vector3(x, y, 0);
            const worldPosition = Vector3.TransformCoordinates(localPosition, viewMatrix);
            this.samples.push(worldPosition);
        }
    }

    // Blender approach for arealights samples generation
    private _sampleRectangle(sampleIndex: number) {
        const htOffset = [0.0, 0.0];
        const htPrimes = [2, 3];

        let htPoint = this._halton2d(htPrimes, htOffset, sampleIndex);

        /* Decorelate AA and shadow samples. (see T68594) */
        htPoint[0] = htPoint[0] * 1151.0 % 1.0;
        htPoint[1] = htPoint[1] * 1069.0 % 1.0;

        /* Change ditribution center to be 0,0 */
        htPoint[0] = htPoint[0] > 0.5 ? htPoint[0] - 1 : htPoint[0];
        htPoint[1] = htPoint[1] > 0.5 ? htPoint[1] - 1 : htPoint[1];

        return htPoint;
    }

    private _halton2d(prime: number[], offset: number[], n: number): number[]
    {
        const invprimes = [1.0 / prime[0], 1.0 / prime[1]];
        const r = [0, 0];

        for (let s = 0; s < n; s++) {
            for (let i = 0; i < 2; i++) {
              r[i] = offset[i] = this._haltonEx(invprimes[i], offset[i]);
            }
        }

        return r;
    }

    private _haltonEx(invprimes: number, offset: number): number
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

    private _updateMatrices() {
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

    public blurKernel: number = 5;

    protected _transparencyShadow = false;

    /** Gets or sets the ability to have transparent shadow  */
    public get transparencyShadow() {
        return this._transparencyShadow;
    }

    public set transparencyShadow(value: boolean) {
        this._transparencyShadow = value;
    }

    private _scene: Scene;

    private _directEffectsManager: DirectEffectsManager;

    protected _kernelBlurXPostprocess: PostProcess;
    protected _kernelBlurYPostprocess: PostProcess;
    protected _dilatePostProcess: PostProcess;
    protected _tonemapPostProcess: PostProcess;
    protected _postProcesses: PostProcess[];

    private _renderingMesh: Mesh;

    /**
     * Instanciates a radiosity renderer
     * @param scene The current scene
     * @param meshes The meshes to include in the radiosity solver
     */
    constructor(scene: Scene, meshes?: Mesh[], lights?: Arealight[]) {
        this._scene = scene;
        this.meshes = meshes || [];
        this.lights = lights || [];

        this._directEffectsManager = new DirectEffectsManager(this._scene);
        this._postProcesses = [];

        this._initializeDilatePostProcess();
        this._initializeBlurPostProcess();

        while (!this._directEffectsManager.isReady() ||
            !this._dilatePostProcess.isReady() ||
            !this._kernelBlurXPostprocess.isReady() ||
            !this._kernelBlurYPostprocess.isReady()) {
        }
    }

    private _initializeDilatePostProcess() {
        const engine = this._scene.getEngine();
        const uniforms = ["texelSize"];
        const samplers = ["textureSampler"];

        this._dilatePostProcess = new PostProcess("dilate", "dilate", uniforms, samplers, 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, "", Constants.TEXTURETYPE_FLOAT);
        this._dilatePostProcess.onApplyObservable.add((effect) => {
            const texture = this._renderingMesh.directInfo.shadowMap;
            effect.setTexture("textureSampler", texture);
            effect.setFloat2("texelSize", 1 / texture.getSize().width, 1 / texture.getSize().height);
        });
        this._dilatePostProcess.autoClear = false;

        this._postProcesses.push(this._dilatePostProcess);
    }

    private _initializeBlurPostProcess() {
        const engine = this._scene.getEngine();

        this._kernelBlurXPostprocess = new BlurPostProcess("KernelBlurX", new Vector2(1, 0), this.blurKernel, 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, Constants.TEXTURETYPE_FLOAT);
        this._kernelBlurYPostprocess = new BlurPostProcess("KernelBlurY", new Vector2(0, 1), this.blurKernel, 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, Constants.TEXTURETYPE_FLOAT);

        this._kernelBlurXPostprocess.autoClear = false;
        this._kernelBlurYPostprocess.autoClear = false;

        this._postProcesses.push(this._kernelBlurXPostprocess, this._kernelBlurYPostprocess);
    }

    // private _initializeTonemapPostProcess() {
    //     const engine = this._scene.getEngine();

    //      this._tonemapPostProcess = new TonemapPostProcess("tonemap", TonemappingOperator.Reinhard, 0.8, null, Texture.BILINEAR_SAMPLINGMODE, engine);
    //      this._postProcesses.push(this._tonemapPostProcess);
    // }

    private _toneMappingRendering(origin : Texture, dest: Texture) {
        let engine = this._scene.getEngine();
        let effect = this._directEffectsManager.radiosityPostProcessEffect;

        engine.enableEffect(effect);
        engine.setState(false);
        engine.bindFramebuffer(<InternalTexture>dest._texture);

        let vb: any = {};
        vb[VertexBuffer.PositionKind] = this._directEffectsManager.screenQuadVB;
        effect.setTexture("inputTexture", origin);
        effect.setFloat("exposure", 4);
        engine.bindBuffers(vb, this._directEffectsManager.screenQuadIB, effect);

        engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
        engine.drawElementsType(Material.TriangleFillMode, 0, 6);

        engine.unBindFramebuffer(<InternalTexture>dest._texture);
    }

    public renderNextSample() {
        const light = this.lights.slice().sort((light1, light2) => {
            if (light1.sampleIndex === light1.sampleCount - 1
                && light2.sampleIndex === light2.sampleCount - 1) {
                return 0;
            }
            else if (light1.sampleIndex === light1.sampleCount - 1) {
                return -1;
            }
            else if (light2.sampleIndex === light2.sampleCount - 1) {
                return -1;
            }

            return light1.sampleIndex - light2.sampleIndex;
        })[0];
        const sampleIndex = light.sampleIndex;

        this.renderVisibilityMapCubeSample(light, light.samples[sampleIndex]);

        this.renderSampleToShadowMapTexture(light, light.samples[sampleIndex]);
    }

    public render() {
        this.clearLightmaps();

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
            this._renderingMesh = mesh;

            this._dilatePostProcess.width = mesh.directInfo.shadowMapSize.width;
            this._dilatePostProcess.height = mesh.directInfo.shadowMapSize.height;
            this._scene.postProcessManager.directRender(this._postProcesses, mesh.directInfo.tempTexture.getInternalTexture(), true);

            this._toneMappingRendering(mesh.directInfo.tempTexture, mesh.directInfo.shadowMap);

            // const temp = mesh.directInfo.shadowMap._texture;
            // mesh.directInfo.shadowMap._texture = mesh.directInfo.tempTexture._texture;
            // mesh.directInfo.tempTexture._texture = temp;
        }
    }

    private renderSampleToShadowMapTexture(light: Arealight, samplePosition: Vector3) {
        const viewMatrix = Matrix.LookAtLH(samplePosition, samplePosition.add(light.normal), Vector3.Up());
        const engine = this._scene.getEngine();
        const effect = this._directEffectsManager.shadowMappingEffect;

        for (const mesh of this.meshes) {
            engine.enableEffect(effect);
            effect.setTexture("depthMap", light.depthMap);
            effect.setMatrix("view", viewMatrix);
            effect.setFloat2("nearFar", light.near, light.far);
            effect.setVector3("lightPos", samplePosition);
            effect.setFloat("sampleCount", light.samples.length);
            effect.setTexture("gatherTexture", mesh.directInfo.shadowMap);

            // Rendering shadow to tempTexture
            engine.setDirectViewport(0, 0, mesh.directInfo.shadowMapSize.width, mesh.directInfo.shadowMapSize.height);
            engine.setState(mesh!.material!.backFaceCulling, 0, true, true);
            engine.bindFramebuffer(<InternalTexture>mesh.directInfo.tempTexture.getInternalTexture());

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

            engine.unBindFramebuffer(<InternalTexture>mesh.directInfo.tempTexture.getInternalTexture());

            // Swap temp and shadow texture
            const temp = mesh.directInfo.shadowMap._texture;
            mesh.directInfo.shadowMap._texture = mesh.directInfo.tempTexture._texture;
            mesh.directInfo.tempTexture._texture = temp;
        }
    }

    public clearLightmaps() {
        const engine = this._scene.getEngine();
        for (const mesh of this.meshes) {
            engine.setDirectViewport(0, 0, mesh.directInfo.shadowMapSize.width, mesh.directInfo.shadowMapSize.height);
            engine.bindFramebuffer(<InternalTexture>mesh.directInfo.shadowMap._texture);
            engine.clear(new Color4(0, 0, 0, 0), true, true);
            engine.unBindFramebuffer(<InternalTexture>mesh.directInfo.shadowMap._texture);

            engine.setDirectViewport(0, 0, mesh.directInfo.shadowMapSize.width, mesh.directInfo.shadowMapSize.height);
            engine.bindFramebuffer(<InternalTexture>mesh.directInfo.tempTexture._texture);
            engine.clear(new Color4(0, 0, 0, 0), true, true);
            engine.unBindFramebuffer(<InternalTexture>mesh.directInfo.tempTexture._texture);
        }
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

    // Copied for shadowGenerator
    // protected _renderForShadowMap(opaqueSubMeshes: SmartArray<SubMesh>, alphaTestSubMeshes: SmartArray<SubMesh>, transparentSubMeshes: SmartArray<SubMesh>, depthOnlySubMeshes: SmartArray<SubMesh>): void {
    //     var index: number;
    //     let engine = this._scene.getEngine();

    //     const colorWrite = engine.getColorWrite();
    //     if (depthOnlySubMeshes.length) {
    //         engine.setColorWrite(false);
    //         for (index = 0; index < depthOnlySubMeshes.length; index++) {
    //             this._renderSubMeshForShadowMap(depthOnlySubMeshes.data[index]);
    //         }
    //         engine.setColorWrite(colorWrite);
    //     }

    //     for (index = 0; index < opaqueSubMeshes.length; index++) {
    //         this._renderSubMeshForShadowMap(opaqueSubMeshes.data[index]);
    //     }

    //     for (index = 0; index < alphaTestSubMeshes.length; index++) {
    //         this._renderSubMeshForShadowMap(alphaTestSubMeshes.data[index]);
    //     }

    //     if (this._transparencyShadow) {
    //         for (index = 0; index < transparentSubMeshes.length; index++) {
    //             this._renderSubMeshForShadowMap(transparentSubMeshes.data[index]);
    //         }
    //     }
    // }

    // Copied for shadowGenerator
    // protected _renderSubMeshForShadowMap(subMesh: SubMesh): void {
    //     var ownerMesh = subMesh.getMesh();
    //     var replacementMesh = ownerMesh._internalAbstractMeshDataInfo._actAsRegularMesh ? ownerMesh : null;
    //     var renderingMesh = subMesh.getRenderingMesh();
    //     var effectiveMesh = replacementMesh ? replacementMesh : renderingMesh;
    //     var scene = this._scene;
    //     var engine = scene.getEngine();
    //     let material = subMesh.getMaterial();

    //     effectiveMesh._internalAbstractMeshDataInfo._isActiveIntermediate = false;

    //     if (!material || subMesh.verticesCount === 0) {
    //         return;
    //     }

    //     // Culling
    //     engine.setState(material.backFaceCulling);

    //     // Managing instances
    //     var batch = renderingMesh._getInstancesRenderList(subMesh._id, !!replacementMesh);
    //     if (batch.mustReturn) {
    //         return;
    //     }

    //     var hardwareInstancedRendering = (engine.getCaps().instancedArrays) && (batch.visibleInstances[subMesh._id] !== null) && (batch.visibleInstances[subMesh._id] !== undefined);
    //     if (this.isReady()) {
    //         const shadowDepthWrapper = renderingMesh.material?.shadowDepthWrapper;

    //         let effect = shadowDepthWrapper?.getEffect(subMesh, this) ?? this.;

    //         engine.enableEffect(effect);

    //         renderingMesh._bind(subMesh, effect, material.fillMode);

    //         this.getTransformMatrix(); // make sur _cachedDirection et _cachedPosition are up to date

    //         effect.setFloat3("biasAndScaleSM", this.bias, this.normalBias, this.depthScale);

    //         if (scene.activeCamera) {
    //             effect.setFloat2("depthValuesSM", this.getLight().getDepthMinZ(scene.activeCamera), this.getLight().getDepthMinZ(scene.activeCamera) + this.getLight().getDepthMaxZ(scene.activeCamera));
    //         }

    //         if (shadowDepthWrapper) {
    //             subMesh._effectOverride = effect;
    //             if (shadowDepthWrapper.standalone) {
    //                 shadowDepthWrapper.baseMaterial.bindForSubMesh(effectiveMesh.getWorldMatrix(), renderingMesh, subMesh);
    //             } else {
    //                 material.bindForSubMesh(effectiveMesh.getWorldMatrix(), renderingMesh, subMesh);
    //             }
    //             subMesh._effectOverride = null;
    //         } else {
    //             effect.setMatrix("viewProjection", this.getTransformMatrix());
    //             // Alpha test
    //             if (material && material.needAlphaTesting()) {
    //                 var alphaTexture = material.getAlphaTestTexture();
    //                 if (alphaTexture) {
    //                     effect.setTexture("diffuseSampler", alphaTexture);
    //                     effect.setMatrix("diffuseMatrix", alphaTexture.getTextureMatrix() || this._defaultTextureMatrix);
    //                 }
    //             }

    //             // Bones
    //             if (renderingMesh.useBones && renderingMesh.computeBonesUsingShaders && renderingMesh.skeleton) {
    //                 const skeleton = renderingMesh.skeleton;

    //                 if (skeleton.isUsingTextureForMatrices) {
    //                     const boneTexture = skeleton.getTransformMatrixTexture(renderingMesh);

    //                     if (!boneTexture) {
    //                         return;
    //                     }

    //                     effect.setTexture("boneSampler", boneTexture);
    //                     effect.setFloat("boneTextureWidth", 4.0 * (skeleton.bones.length + 1));
    //                 } else {
    //                     effect.setMatrices("mBones", skeleton.getTransformMatrices((renderingMesh)));
    //                 }
    //             }

    //             // Morph targets
    //             MaterialHelper.BindMorphTargetParameters(renderingMesh, effect);

    //             // Clip planes
    //             MaterialHelper.BindClipPlane(effect, scene);
    //         }

    //         this._bindCustomEffectForRenderSubMeshForShadowMap(subMesh, effect, shadowDepthWrapper?._matriceNames, effectiveMesh);

    //         if (this.forceBackFacesOnly) {
    //             engine.setState(true, 0, false, true);
    //         }

    //         // Observables
    //         this.onBeforeShadowMapRenderMeshObservable.notifyObservers(renderingMesh);
    //         this.onBeforeShadowMapRenderObservable.notifyObservers(effect);

    //         // Draw
    //         renderingMesh._processRendering(effectiveMesh, subMesh, effect, material.fillMode, batch, hardwareInstancedRendering,
    //             (isInstance, world) => effect.setMatrix("world", world));

    //         if (this.forceBackFacesOnly) {
    //             engine.setState(true, 0, false, false);
    //         }

    //         // Observables
    //         this.onAfterShadowMapRenderObservable.notifyObservers(effect);
    //         this.onAfterShadowMapRenderMeshObservable.notifyObservers(renderingMesh);
    //     }
    // }

    private renderSubMesh = (subMesh: SubMesh, effect: Effect) => {
        let engine = this._scene.getEngine();
        let mesh = subMesh.getRenderingMesh();
        let material = subMesh.getMaterial();

        if (!material || subMesh.verticesCount === 0) {
            return;
        }

        mesh._bind(subMesh, effect, Material.TriangleFillMode);
        engine.setState(material.backFaceCulling);

        if (material.needAlphaTesting()) {
            const alphaTexture = material.getAlphaTestTexture();

            if (alphaTexture) {
                effect.setTexture("alphaTexture", alphaTexture);
            }
        }

        var batch = mesh._getInstancesRenderList(subMesh._id);

        if (batch.mustReturn) {
            return;
        }

        // Draw triangles
        const hardwareInstancedRendering = Boolean(engine.getCaps().instancedArrays && batch.visibleInstances[subMesh._id]);
        mesh._processRendering(mesh, subMesh, effect, Material.TriangleFillMode, batch, hardwareInstancedRendering,
            (isInstance, world) => effect.setMatrix("world", world));
    }

    private renderVisibilityMapCubeSample(light: Arealight, samplePosition: Vector3) {
        const engine = this._scene.getEngine();
        const gl = engine._gl;
        const opaqueEffect = this._directEffectsManager.opaqueVisibilityEffect;
        const alphaEffect = this._directEffectsManager.alphaVisibilityEffect;

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
            light.projectionMatrix,
            light.projectionMatrixPX,
            light.projectionMatrixNX,
            light.projectionMatrixPY,
            light.projectionMatrixNY
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

            for (const mesh of this.meshes) {
                for (const subMesh of mesh.subMeshes) {
                    const material = subMesh.getMaterial();
                    const effect = material?.needAlphaTesting() && material.getAlphaTestTexture() ? alphaEffect : opaqueEffect;
                    engine.enableEffect(effect);

                    effect.setMatrix("view", viewMatrices[viewIndex]);
                    effect.setMatrix("projection", projectionMatrices[viewIndex]);
                    effect.setVector3("lightPos", samplePosition);
                    effect.setFloat("bias", light.bias);
                    effect.setFloat("normalBias", light.normalBias);
                    effect.setFloat2("nearFar", light.near, light.far);

                    this.renderSubMesh(subMesh, effect);
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
