import { Scene } from '../..';
import { Mesh, VertexBuffer } from '../../Meshes';
import { Material, Effect, RawTexture, InternalTexture } from '../../Materials';
import { Color4, Vector3 } from '../../Maths';
import { Engine } from '../../Engines';

import './../../Shaders/irradianceVolumeIrradianceLightmap.fragment';
import './../../Shaders/irradianceVolumeIrradianceLightmap.vertex';
import '../../Shaders/irradianceVolumeUpdateProbeBounceEnv.vertex';
import '../../Shaders/irradianceVolumeUpdateProbeBounceEnv.fragment';

import { Probe } from './Probe';
import { MeshDictionary } from './meshDictionary';

/**
 * Class that aims to take care of everything with regard to the irradiance for the irradiance volume
 * It will take care to intialize all the textures and effect
 * It will launch the rendering of everything we need to render
 */
export class Irradiance {

    private _scene : Scene;
    private _uniformNumberProbes: Vector3;
    private _uniformBottomLeft : Vector3;
    private _uniformBoxSize : Vector3;
    private _probesPosition : Float32Array;
    private _shTexture : RawTexture;
    private _posProbesTexture : RawTexture;

    private _isReadyPromise : Promise<any>;

    public isReady(): Promise<any> {
        return this._isReadyPromise;
    }

    /**
     * The list of probes that are part of this irradiance volume
     * This list is a 3 dimensions rectangle, transform into a list
     * To know the dimension of each size, you have to check tje _uniformNumberProbes param 
     */
    public probeList : Array<Probe>;

    /**
     * The meshes that are render by the probes
     */
    public meshes : Array<Mesh>;

    /**
     * The effect used to render the environment of each probe
     */
    public captureEnvironmentEffect : Effect;

    /**
     * The effect used to render the irradiance on each mesh
     */
    public irradianceLightmapEffect : Effect;

    /**
     * The dictionary that stores the lightmaps linked to each mesh
     */
    public dictionary : MeshDictionary;

    /**
     * The number of bounces we want to add to the scene
     * 0 == only direct lightning
     * 1 == one bounce of light
     */
    public numberBounces : number;


    /**
     * Initializer of the irradiance class
     * @param scene The scene of the meshes
     * @param probes The probes that are used to render irradiance
     * @param meshes The meshes that are used to render irradiance
     * @param dictionary The dictionary that contains information about meshes
     * @param numberBounces The number of bounces we want to render
     * @param numberProbes A vec3 representing the number of probes on each axis of the volume
     * @param bottomLeft    A position representing the position of the probe on the bottom left of the irradiance volume
     * @param volumeSize A vec3 containing the volume width, height and depth
     */
    constructor(scene : Scene, probes : Array<Probe>, meshes : Array<Mesh>, dictionary : MeshDictionary, numberBounces : number,
        numberProbes : Vector3, bottomLeft : Vector3, volumeSize : Vector3) {
        this._scene = scene;
        this.probeList = probes;
        this.meshes = meshes.slice();

        this.dictionary = dictionary;
        this.numberBounces = numberBounces;
        this._uniformNumberProbes = numberProbes;
        this._uniformBottomLeft = bottomLeft;
        this._uniformBoxSize = volumeSize;

        this._createProbePositionList();
        this._initDataTextures();

        dictionary.initIrradianceTextures();

        this._isReadyPromise = Promise.all([
            this._isCaptureEnvironmentEffectReady(),
            this._isIrradianceLightmapEffectReady(),
        ]);
    }

    /**
     * Function that launch the render process for the computation of the irradiance
     */
    public render() : void {
        // When all we need is ready
        this._isReadyPromise = this._isReadyPromise.then(() => {
            for (let probe of this.probeList) {
                probe.initForRendering(this.dictionary, this.captureEnvironmentEffect);
                probe.initEnvironmentRenderer(this.meshes);
            }

            if (this.numberBounces > 0) {
                // Call the recursive function that will render each bounce
                this._renderBounce(1);
            } else {
                this.dictionary.render();
            }
        });
    }

    /**
     * Render a bounce of light
     * @param currentBounce 
     */
    private _renderBounce(currentBounce : number) {
        for (let probe of this.probeList) {
            if (probe.probeInHouse == Probe.INSIDE_HOUSE) {
                probe.environmentProbeTexture.render();
                probe.CPUcomputeSHCoeff();
            }
        }

        this.updateShTexture();
        this._renderIrradianceLightmap();

        if (currentBounce < this.numberBounces) {
            this._renderBounce(currentBounce + 1);
        } else {
            this.dictionary.render();
        }
    }

    /**
     * Method called to store the spherical harmonics coefficient into a texture,
     * allowing to have less uniforms in our shader
     * Has to be called envery time we want to compute irradiance on a mesh, because
     * we have to update the sh coeff if it has changed
     */
    public updateShTexture() : void {
        let shArray = new Float32Array(this.probeList.length * 9  * 4);
        this.probeList.forEach((probe, i) => {
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
            } else {
                let index = i * 9 * 4;
                for (let j = 0; j < 36; j++) {
                    shArray[index + j] = 0.;
                }
            }
        });

        this._shTexture.update(shArray);
    }

    /**
     * Method called to store in a list the positions and the states of the probes
     * It will be then used to create a RawTexture to use as a uniform in a shader
     */
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

    /**
     * Method called to render the irradiance on the lightmap corresponding to each mesh
     */
    private _renderIrradianceLightmap() : void {
        let engine = this._scene.getEngine();
        let effect = this.irradianceLightmapEffect;
        for (let mesh of this.dictionary.keys()) {
            let value = this.dictionary.getValue(mesh);
            if (value != null) {
                let dest = value.irradianceLightmap;

                engine.enableEffect(effect);
                // TODO: May be useless
                // effect.setMatrix("world", mesh.getWorldMatrix());
                effect.setInt("isUniform", 1);
                effect.setVector3("numberProbesInSpace", this._uniformNumberProbes);
                effect.setVector3("boxSize", this._uniformBoxSize);
                effect.setVector3("bottomLeft", this._uniformBottomLeft);
                effect.setTexture("shText", this._shTexture);
                effect.setTexture("probePosition", this._posProbesTexture);
                engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
                engine.setState(false);

                engine.bindFramebuffer(<InternalTexture>dest.getInternalTexture());

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
                        (_, world) => effect.setMatrix("world", world));
                }

                engine.unBindFramebuffer(<InternalTexture>dest.getInternalTexture());
            }
        }
    }

    /**
        });
     * Create the promise that is used to check if every thing we will need to render the irradiance
     * is ready, when we will start the rendering
     */
    private _initDataTextures(): void {
        let initArray = new Float32Array(this.probeList.length * 9 * 4).fill(0);
        this._shTexture = new RawTexture(initArray, 9, this.probeList.length, Engine.TEXTUREFORMAT_RGBA, this._scene, false, false, 0, Engine.TEXTURETYPE_FLOAT);
        this._posProbesTexture = new RawTexture(this._probesPosition, 1, this.probeList.length, Engine.TEXTUREFORMAT_RGBA, this._scene, false, false, 0, Engine.TEXTURETYPE_FLOAT);
    }

    private _isIrradianceLightmapEffectReady(): Promise<void> {
        return new Promise((resolve) => {
            var attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UV2Kind];
            var uniforms = ["world", "isUniform", "numberProbesInSpace", "boxSize", "bottomLeft"];
            var samplers = ["shText", "probePosition"];
            var defines = "#define NUM_PROBES " + this.probeList.length;

            this.irradianceLightmapEffect = this._scene.getEngine().createEffect("irradianceVolumeIrradianceLightmap",
                attribs,
                uniforms,
                samplers,
                defines,
                undefined,
                () => resolve(),
            );
        });
    }

    private _isCaptureEnvironmentEffectReady(): Promise<void> {
        return new Promise((resolve) => {
            var attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind, VertexBuffer.UV2Kind];
            var samplers = ["irradianceMap", "albedoTexture", "directIlluminationLightmap"];
            var uniform = ["world", "view", "projection", "probePosition", "albedoColor", "hasTexture", "envMultiplicator"];
            this.captureEnvironmentEffect = this._scene.getEngine().createEffect(
                "irradianceVolumeUpdateProbeBounceEnv",
                attribs,
                uniform,
                samplers,
                "",
                undefined,
                () => resolve(),
            );
        });
    }

    /**
     * Method to call when you want to update the number of bounces, after the irradiance rendering has been done
     * It restart the rendering to take change into account
     * @param numberBounces The new number of bounce we want
     */
    public updateNumberBounces(numberBounces : number) {
        if (this.numberBounces < numberBounces) {
            // Render more bounces
            let currentBounce = this.numberBounces + 1;
            this.numberBounces = numberBounces;
            this._renderBounce(currentBounce);
        } else if (this.numberBounces > numberBounces) {
            // Rerender from first bounce
            this.numberBounces = numberBounces;
            this._clearIrradianceLightmaps();
            this.render();
        }
    }

    /**
     * Method that has to be called when the render is finished
     * It will update the multiplicator used to capture direct light in the probe environment and restart the rendering
     * @param envMultiplicator 
     */
    public updateDirectIllumForEnv(envMultiplicator : number) {
        this.probeList.forEach(probe => {
            probe.envMultiplicator = envMultiplicator;
        });

        if (this.numberBounces > 0) {
            this._clearIrradianceLightmaps()
            this._renderBounce(1);
        }
    }

    private _clearIrradianceLightmaps() {
        let engine = this._scene.getEngine();
        for (let value of this.dictionary.values()) {
            let internal = value.result.getInternalTexture();
            if (internal != null) {
                engine.bindFramebuffer(internal);
                engine.clear(new Color4(0., 0., 0., 1.), true, true, true);
                engine.unBindFramebuffer(internal);
            }
        }
    }

}
