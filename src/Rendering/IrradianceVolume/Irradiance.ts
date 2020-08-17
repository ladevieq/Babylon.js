import { Scene } from '../../scene';
import { Probe } from './Probe';
import { Mesh } from '../../Meshes/mesh';
import { Material } from '../../Materials/material';

import { VertexBuffer } from '../../Meshes/buffer';
import { Effect } from '../../Materials/effect';
import { Vector3 } from '../../Maths/math.vector';
import { MeshDictionary } from './meshDictionary';
import { RawTexture } from '../../Materials/Textures/rawTexture';
import { Engine } from '../../Engines/engine';
import { Color4 } from '../../Maths/math.color';

import "./../../Shaders/irradianceVolumeIrradianceLightmap.fragment";
import "./../../Shaders/irradianceVolumeIrradianceLightmap.vertex";
import { InternalTexture } from '../../Materials/Textures/internalTexture';
/**
 * Class that aims to take care of everything with regard to the irradiance for the irradiance volume
 */
export class Irradiance {

    private _scene : Scene;

    private _uniformNumberProbes: Vector3;
    private _uniformBottomLeft : Vector3;
    private _uniformBoxSize : Vector3;
    private _probesPosition : Float32Array;
    /**
     * The list of probes that are part of this irradiance volume
     */
    public probeList : Array<Probe>;

    /**
     * The meshes that are render by the probes
     */
    public meshes : Array<Mesh>;

    private _promise : Promise<void>;

    /**
     * The effect that will be use to render the environment of each probes. It will be given to every probes of the volume
     */
    public uvEffect : Effect;

    /**
     * The effect used to render the irradiance from each probe.
     */
    public bounceEffect : Effect;

    public irradianceLightmapEffect : Effect;

    /**
     * The dictionary that stores the lightmaps linked to each mesh
     */
    public dictionary : MeshDictionary;

    /**
     * The number of bounces we want to add to the scene
     */
    public numberBounces : number;

    /**
     * Value that will be set to true once the rendering is finish.
     * Can be used to check if the rendering is finished outiside of this class, because we use Promess
     */
    public finish = false;

    private _shTexture : RawTexture;
    private _posProbesTexture : RawTexture;

    /**
     * Initializer of the irradiance class
     * @param scene The scene of the meshes
     * @param probes The probes that are used to render irradiance
     *
     * @param meshes The meshes that are used to render irradiance
     * @param dictionary The dictionary that contains information about meshes
     * @param numberBounces The number of bounces we want to render
     * @param probeDisposition A vec3 representing the number of probes on each axis of the volume
     * @param bottomLeft    A position representing the position of the probe on the bottom left of the irradiance volume
     * @param volumeSize A vec3 containing the volume width, height and depth
     */
    constructor(scene : Scene, probes : Array<Probe>, meshes : Array<Mesh>, dictionary : MeshDictionary, numberBounces : number,
        probeDisposition : Vector3, bottomLeft : Vector3, volumeSize : Vector3) {
        this._scene = scene;
        this.probeList = probes;
        this.meshes = [];
        for (let mesh of meshes) {
            this.meshes.push(mesh);
        }

        this.dictionary = dictionary;
        this.numberBounces = numberBounces;
        this._uniformNumberProbes = probeDisposition;
        this._uniformBottomLeft = bottomLeft;
        this._uniformBoxSize = volumeSize;

        this._createProbePositionList();

        dictionary.initLightmapTextures();
        //We can only initialize the irradiance lightmap after setting the uniforms attributes, as it is needed for the material
        this._promise = this._createPromise();
    }

    /**
     * Function that launch the render process
     */
    public render() : void {

        // When all we need is ready
        this._promise.then(() => {
            for (let probe of this.probeList) {
                // Init the renderTargetTexture needed for each probes
                probe.render(this.meshes, this.dictionary, this.uvEffect, this.bounceEffect);
                probe.renderBounce(this.meshes);
            }
            let currentBounce = 0;
            for (let probe of this.probeList) {
                // Set these value to false to ensure that the promess will finish when we want it too
                probe.sphericalHarmonicChanged = false;
            }
            if (this.numberBounces > 0) {
                // Call the recursive function that will render each bounce
                this._renderBounce(currentBounce + 1);
            }
            else {
                // We are done with the rendering process, finish has to be set to true
                this.dictionary.render();
                this.finish = true;
            }
        });
    }

    private _renderBounce(currentBounce : number) {
        let renderTime = 0;
        let shTime = 0;
        let beginBounce = new Date().getTime();

        for (let probe of this.probeList) {
            if (probe.probeInHouse == Probe.INSIDE_HOUSE) {
                probe.tempBounce.isCube = false;
                probe.tempBounce.render();
                probe.tempBounce.isCube = true;
                renderTime += probe.renderTime;
                shTime += probe.shTime;
            }
        }
        let endProbeEnv = new Date().getTime();

        this.updateShTexture();
        this._renderIrradianceLightmap();
        let endBounce = new Date().getTime();
        console.log("___________________ \n bounce : " + currentBounce);
        console.log("Temps total : " + (endBounce - beginBounce));
        console.log("Rendu de tous les environnements des probes : " + (endProbeEnv - beginBounce));
        console.log("Rendu de l'irradiance sur la scène : " + (endBounce - endProbeEnv));
        console.log("Temps total capture environnement : " + renderTime);
        console.log("Temps total sh coef : " + shTime);
        if (currentBounce < this.numberBounces) {
            this._renderBounce(currentBounce + 1);
        }
        else {
            this.dictionary.render();
            this.finish = true;
        }

    }

    /**
     * Method called to store the spherical harmonics coefficient into a texture,
     * allowing to have less uniforms in our shader
     */
    public updateShTexture() : void {
        let shArray = new Float32Array(this.probeList.length * 9  * 4);
        for (let i = 0; i < this.probeList.length; i++) {
            let probe = this.probeList[i];
            if (probe.probeInHouse != Probe.OUTSIDE_HOUSE) {
                let index = i * 9 * 4;

                shArray[index] =  probe.sphericalHarmonic.l00.x;
                shArray[index + 1] =  probe.sphericalHarmonic.l00.y;
                shArray[index + 2] = probe.sphericalHarmonic.l00.z;
                shArray[index + 3] = 1;

                shArray[index + 4] = probe.sphericalHarmonic.l11.x;
                shArray[index + 5] = probe.sphericalHarmonic.l11.y;
                shArray[index + 6] = probe.sphericalHarmonic.l11.z;
                shArray[index + 7] = 1;

                shArray[index + 8] = probe.sphericalHarmonic.l10.x;
                shArray[index + 9] =  probe.sphericalHarmonic.l10.y;
                shArray[index + 10] =  probe.sphericalHarmonic.l10.z;
                shArray[index + 11] = 1;

                shArray[index + 12] =  probe.sphericalHarmonic.l1_1.x;
                shArray[index + 13] =  probe.sphericalHarmonic.l1_1.y;
                shArray[index + 14] = probe.sphericalHarmonic.l1_1.z;
                shArray[index + 15] = 1;

                shArray[index + 16] =  probe.sphericalHarmonic.l22.x;
                shArray[index + 17] =  probe.sphericalHarmonic.l22.y;
                shArray[index + 18] =  probe.sphericalHarmonic.l22.z;
                shArray[index + 19] = 1;

                shArray[index + 20] =  probe.sphericalHarmonic.l21.x;
                shArray[index + 21] =  probe.sphericalHarmonic.l21.y;
                shArray[index + 22] =  probe.sphericalHarmonic.l21.z;
                shArray[index + 23] = 1;

                shArray[index + 24] =  probe.sphericalHarmonic.l20.x;
                shArray[index + 25] =  probe.sphericalHarmonic.l20.y;
                shArray[index + 26] =  probe.sphericalHarmonic.l20.z;
                shArray[index + 27] = 1;

                shArray[index + 28] =  probe.sphericalHarmonic.l2_1.x;
                shArray[index + 29] =  probe.sphericalHarmonic.l2_1.y;
                shArray[index + 30] =  probe.sphericalHarmonic.l2_1.z;
                shArray[index + 31] = 1;

                shArray[index + 32] =  probe.sphericalHarmonic.l2_2.x;
                shArray[index + 33] =  probe.sphericalHarmonic.l2_2.y;
                shArray[index + 34] =  probe.sphericalHarmonic.l2_2.z;
                shArray[index + 35] =  1;
            }
            else {
                let index = i * 9 * 4;
                for (let j = 0; j < 36; j++) {
                    shArray[index + j] = 0.;
                }
            }
        }
        this._shTexture.update(shArray);
    }

    private _createProbePositionList() {

        this._probesPosition = new Float32Array(this.probeList.length * 4);
        for (let i = 0; i < this.probeList.length; i++) {
            let probe = this.probeList[i];
            this._probesPosition[i * 4] = probe.position.x;
            this._probesPosition[i * 4 + 1] = probe.position.y;
            this._probesPosition[i * 4 + 2] = probe.position.z;
            if (probe.probeInHouse != Probe.OUTSIDE_HOUSE) {
                this._probesPosition[i * 4 + 3] = 1.;
            }
            else {
                this._probesPosition[i * 4 + 3] = 0.;
            }
        }
    }

    private _renderIrradianceLightmap() : void {
        let engine = this._scene.getEngine();
        let gl = engine._gl;
        let effect = this.irradianceLightmapEffect;

        // this.irradianceLightmapEffect.backFaceCulling = false;

        for (let mesh of this.dictionary.keys()) {
            let value = this.dictionary.getValue(mesh);
            if (value != null) {
                let mrt = value.postProcessLightmap;
                let dest = mrt.textures[2];
                engine.enableEffect(effect);

                effect.setMatrix("world", mesh.getWorldMatrix());
                effect.setInt("isUniform", 1);
                effect.setVector3("numberProbesInSpace", this._uniformNumberProbes);
                effect.setVector3("boxSize", this._uniformBoxSize);
                effect.setVector3("bottomLeft", this._uniformBottomLeft);
                effect.setTexture("shText", this._shTexture);
                effect.setTexture("probePosition", this._posProbesTexture);

                engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
                engine.setState(false);

                let fb = this.dictionary.frameBuffer1;
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,  (<InternalTexture>dest._texture)._webGLTexture, 0);

                var subMeshes = mesh.subMeshes;
                for (let i = 0; i < subMeshes.length; i++) {
                    var subMesh = subMeshes[i];
                    var batch = mesh._getInstancesRenderList(subMesh._id);

                    if (batch.mustReturn) {
                        return;
                    }

                    var hardwareInstancedRendering = Boolean(engine.getCaps().instancedArrays && batch.visibleInstances[subMesh._id]);
                    mesh._bind(subMesh, effect, Material.TriangleFillMode);
                    mesh._processRendering(mesh, subMesh, effect, Material.TriangleFillMode, batch, hardwareInstancedRendering,
                        (isInstance, world) => effect.setMatrix("world", world));
                }

                gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                // engine.clear(new Color4(0.0, 0.0, 0.0, 0.0), true, true, true);
                // let vb: any = {};
                // vb[VertexBuffer.PositionKind] = mesh.getVertexBuffer(VertexBuffer.PositionKind);
                // vb[VertexBuffer.NormalKind] = mesh.getVertexBuffer(VertexBuffer.NormalKind);
                // vb[VertexBuffer.UV2Kind] = mesh.getVertexBuffer(VertexBuffer.UV2Kind);

                // if (mesh._geometry != null) {
                //     engine.bindBuffers(vb, mesh._geometry.getIndexBuffer(), effect);
                // }

                // engine.drawElementsType(Material.TriangleFillMode, 0, 6);

            }
        }
    }

    private _createPromise() : Promise<void> {
        return new Promise((resolve, reject) => {
            this._initProbesPromise();
            let initArray = new Float32Array(this.probeList.length * 9 * 4);
            this._shTexture = new RawTexture(initArray, 9, this.probeList.length, Engine.TEXTUREFORMAT_RGBA, this._scene, false, false, 0, Engine.TEXTURETYPE_FLOAT);
            this._posProbesTexture = new RawTexture(this._probesPosition, 1, this.probeList.length, Engine.TEXTUREFORMAT_RGBA, this._scene, false, false, 0, Engine.TEXTURETYPE_FLOAT);
            let interval = setInterval(() => {
                let readyStates = [
                    this._isRawTextSHCoefReady(),
                    this._isRawTextProbePosReady(),
                    this._areIrradianceLightMapReady(),
                    this._areProbesReady(),
                    this._isUVEffectReady(),
                    this._isIrradianceLightmapEffectReady(),
                    this._isBounceEffectReady(),
                    this.dictionary.areMaterialReady()
                ];
                for (let i = 0 ; i < readyStates.length; i++) {
                    if (!readyStates[i]) {
                        return ;
                    }
                }
                clearInterval(interval);
                resolve();
            }, 200);
        });
    }

    private _initProbesPromise() : void {
        for (let probe of this.probeList) {
            probe.initPromise();
        }
    }

    private _isRawTextSHCoefReady() : boolean {
        return this._shTexture.isReady();
    }

    private _isRawTextProbePosReady() : boolean {
        return this._posProbesTexture.isReady();
    }

    private _areProbesReady() : boolean {
        let ready = true;
        for (let probe of this.probeList) {
            ready = probe.isProbeReady() && ready;
            if (!ready) {
                return false;
            }
        }
        return true;
    }

    private _isUVEffectReady() : boolean {
        var attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind, VertexBuffer.UV2Kind];
        var uniforms = ["world", "projection", "view", "probePosition", "albedoColor", "hasTexture", "lightmapNumber"];
        var samplers = ["albedoTexture"];
        this.uvEffect = this._scene.getEngine().createEffect("irradianceVolumeProbeEnv",
            attribs,
            uniforms,
            samplers);

        return this.uvEffect.isReady();
    }

    private _isIrradianceLightmapEffectReady() : boolean {
        var attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UV2Kind];
        var uniforms = ["world", "isUniform", "numberProbesInSpace", "boxSize", "bottomLeft"];
        var samplers = ["shText", "probePosition"];
        var defines = "#define NUM_PROBES " + this.probeList.length;

        this.irradianceLightmapEffect = this._scene.getEngine().createEffect("irradianceVolumeIrradianceLightmap",
            attribs,
            uniforms,
            samplers,
            defines
        );

        return this.irradianceLightmapEffect.isReady();
    }

    private _isBounceEffectReady() : boolean {
        // var attribs = [VertexBuffer.PositionKind, VertexBuffer.UVKind];
        var attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind, VertexBuffer.UV2Kind];
        // var samplers = ["envMap", "envMapUV", "irradianceMapArray", "directIlluminationLightMapArray"];
        var samplers = ["envMap", "envMapUV", "irradianceMap", "albedoTexture", "directIlluminationLightmap"];

        // var uniform = ["world", "rotation", "numberLightmap"];
        var uniform = ["projection", "view", "probePosition", "albedoColor", "hasTexture", "world",  "numberLightmap", "envMultiplicator"];
        this.bounceEffect = this._scene.getEngine().createEffect("irradianceVolumeUpdateProbeBounceEnv",
            attribs, uniform,
            samplers);

        return this.bounceEffect.isReady();
    }

    private _areIrradianceLightMapReady() : boolean {
        for (let value of this.dictionary.values()) {
            if (!value.postProcessLightmap.isReady()) {
                return false;
            }
            if (value.directLightmap != null && !value.directLightmap.isReady()) {
                return false;
            }
        }
        return true;
    }

/*
    private  _areProbesEnvMapReady() : boolean {
        for (let probe of this.probeList) {
            if (probe.envCubeMapRendered == false) {
                return false;
            }
        }
        return true;
    }
*/
/*
    private _areShCoeffReady() : boolean {
        for (let probe of this.probeList) {
            if (! probe.sphericalHarmonicChanged) {
                return false;
            }
        }
        return true;
    }
*/

    /**
     * Method to call when you want to update the number of bounces, after the irradiance rendering has been done
     * @param numberBounces
     */
    public updateNumberBounces(numberBounces : number) {
        if (this.numberBounces < numberBounces) {
            this.finish = false;
            let currentBounce = this.numberBounces + 1;
            this.numberBounces = numberBounces;
            this._renderBounce(currentBounce);
        }
        else if (this.numberBounces > numberBounces) {
            this.finish = false;
            this.numberBounces = numberBounces;
            let engine = this._scene.getEngine();
            for (let value of this.dictionary.values()) {
                let internal = value.postProcessLightmap.getInternalTexture();
                if (internal != null) {
                    engine.bindFramebuffer(internal);
                    engine.clear(new Color4(0., 0., 0., 1.), true, true, true);
                    engine.unBindFramebuffer(internal);
                }
            }
            if (this.numberBounces == 0) {
                this.dictionary.render();
            }
            else {
                this._renderBounce(1);
            }
        }
        else {
            return;
        }

    }

    public updateDirectIllumForEnv(envMultiplicator : number) {
        for (let probe of this.probeList) {
            probe.envMultiplicator = envMultiplicator;
        }
        if (this.numberBounces > 0) {
            let engine = this._scene.getEngine();
            for (let value of this.dictionary.values()) {
                let internal = value.postProcessLightmap.getInternalTexture();
                if (internal != null) {
                    engine.bindFramebuffer(internal);
                    engine.clear(new Color4(0., 0., 0., 1.), true, true, true);
                    engine.unBindFramebuffer(internal);
                }
            }
            this._renderBounce(1);
        }
    }

}
