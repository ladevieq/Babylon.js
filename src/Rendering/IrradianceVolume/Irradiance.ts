import { Scene } from '../../scene';
import { Probe } from './Probe';
import { RenderTargetTexture } from '../../Materials/Textures/renderTargetTexture';
import { Mesh } from '../../Meshes/mesh';
import { Material } from '../../Materials/material';
import { Nullable } from '../../types';
import { ShaderMaterial } from '../../Materials/shaderMaterial';
import { Texture } from '../../Materials/Textures/texture';
import { VertexBuffer } from '../../Meshes/buffer';
import { Effect } from '../../Materials/effect';
import { Vector3 } from '../../Maths/math.vector';
import { PostProcessRenderPipelineManagerSceneComponent } from '../../PostProcesses';

/**
 * Class that aims to take care of everything with regard to the irradiance for the irradiance volum
 */
export class Irradiance {

    private _scene : Scene;
    
    private _uniformNumberProbes: Vector3;  // Only need to use when the box is uniform
    private _uniformBottomLeft : Vector3;   //Only need to use when the box is uniform
    private _uniformBoxSize : Vector3;  //Only need to use when the box is uniform
    
    /**
     * The list of probes that are part of this irradiance volume
     */
    public probeList : Array<Probe>;

    /**
     * The meshes that are render by the probes
     */
    public meshes : Array<Mesh>;

    /**
     * Texture that conntains the light map of the irradiance of the scene
     */
    public irradianceLightmap : RenderTargetTexture; 

    private _promise : Promise<void>;
    
    private _strAlbedo : string;
    public uvEffect : Effect;
    public albedo : Texture;

    /**
     * Initiate a new Iradiance
     * @param scene The scene the irradiance is
     * @param probes The probes that are used to render the irradiance
     * @param meshes The meshes that are rendered by the probes
     */
    constructor(scene : Scene, probes : Array<Probe>, meshes : Array<Mesh>, strAlbedo : string){
        this._scene = scene;
        this.probeList = probes;
        this.meshes = meshes;
        this._strAlbedo = strAlbedo;
        this._promise = this._createPromise();
    }


    /**
     * Add a probe to the list of probes after initialisation
     * @param probe The probe to be added
     */
    public addProbe(probe : Probe) {
        this.probeList.push(probe);
        //We have to recreate the promise because the values have changed
        this._promise = this._createPromise();
    }   

    public setUniform(numberProbes : Vector3, bottomLeft : Vector3, size : Vector3) : void {
        this._uniformNumberProbes = numberProbes;
        this._uniformBottomLeft = bottomLeft;
        this._uniformBoxSize = size;
    }

    /**
     * Function that launch all the render needed to create the final light map of irradiance that contains
     * global illumination
     */
    public render() : void {
        let irradiance = this;
        // When all we need is ready 
        this._promise.then( function () {
            for (let probe of irradiance.probeList){
                probe.render(irradiance.meshes, irradiance.albedo, irradiance.uvEffect);
            }
            let envCubeMapProbesRendered = new Promise((resolve, reject) => {
                let interval = setInterval(() => {
                    let readyStates = [
                        irradiance._areProbesEnvMapReady()
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
            envCubeMapProbesRendered.then( function (){
                irradiance._renderBounces();
            });
            //Creation of a promise to know when the shCoeff are modified => probe has been rendered
            // we can then compute the light map of irradiance
           /*
            let shCoefPromise = new Promise((resolve, reject) => {
                let interval = setInterval(() => {
                    let readyStates = [
                        irradiance._areShCoeffReady()
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

            shCoefPromise.then( function (){
                irradiance._fillLightMap();
            });
            */
        });
    }

    private _renderBounces() {
        for (let probe of this.probeList){
            probe.renderBounce( this.irradianceLightmap );
        }
    }

    private _createPromise() : Promise<void> {
        return new Promise((resolve, reject) => {
            this._initProbesPromise();
            this.irradianceLightmap = new RenderTargetTexture("irradianceLightMap", 1024, this._scene);
            this.albedo = new Texture(this._strAlbedo, this._scene);
            let interval = setInterval(() => {
                let readyStates = [
                    this._isIrradianceLightMapReady(),
                    this._isTextureReady(),
                    this._areProbesReady(),
                    this._isEffectReady()
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
        for (let probe of this.probeList){
            probe.initPromise();
        }
    }

    private _areProbesReady() : boolean {
        let ready = true;
        for (let probe of this.probeList){
            ready = probe.isProbeReady() && ready;
            if (!ready){
                return false;
            }
        }
        return true;
    }

    private _isTextureReady() : boolean {
        return this.albedo.isReady();
    }

    private _isEffectReady() : boolean {
        var attribs = [VertexBuffer.PositionKind, VertexBuffer.UVKind];
        var uniforms = ["world", "projection", "view"];
        var samplers = ["albedo"];
        this.uvEffect = this._scene.getEngine().createEffect("uv", 
            attribs,
            uniforms,
            samplers);
    
        return this.uvEffect.isReady();
    }

    private _isIrradianceLightMapReady() : boolean {    
        return this.irradianceLightmap.isReady();
    }

    private  _areProbesEnvMapReady() : boolean {
        for (let probe of this.probeList) {
            if (probe.envCubeMapRendered == false){
                return false;
            }
        }
        return true;  
    }

    private _areShCoeffReady() : boolean {
        for (let probe of this.probeList) {
            if (probe.sphericalHarmonic == null){
                return false;
            }
        }
        return true;
    };

    private _fillLightMap() : void {
        this.irradianceLightmap.renderList = this.meshes;
        this._scene.customRenderTargets.push(this.irradianceLightmap);
        this.irradianceLightmap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
       
        let irradianceMaterial = new ShaderMaterial("irradianceMaterial", this._scene, 
            "./../../src/Shaders/irradianceLightmap", {
                attributes : ["position", "normal", "uv"],
                uniforms : ["world"],
                defines : ["#define NUM_PROBES " + this.probeList.length]
        });

        let probePosition = [];
        let shCoef = [];
        for (let probe of  this.probeList){
            probePosition.push(probe.sphere.position.x);
            probePosition.push(probe.sphere.position.y);
            probePosition.push(probe.sphere.position.z);

            //We need to put float instead of vector3
            shCoef.push(probe.sphericalHarmonic.l00.x);
            shCoef.push(probe.sphericalHarmonic.l00.y);
            shCoef.push(probe.sphericalHarmonic.l00.z);

            shCoef.push(probe.sphericalHarmonic.l11.x);
            shCoef.push(probe.sphericalHarmonic.l11.y);
            shCoef.push(probe.sphericalHarmonic.l11.z);

            shCoef.push(probe.sphericalHarmonic.l10.x);
            shCoef.push(probe.sphericalHarmonic.l10.y);
            shCoef.push(probe.sphericalHarmonic.l10.z);

            shCoef.push(probe.sphericalHarmonic.l1_1.x);
            shCoef.push(probe.sphericalHarmonic.l1_1.y);
            shCoef.push(probe.sphericalHarmonic.l1_1.z);

            shCoef.push(probe.sphericalHarmonic.l22.x);
            shCoef.push(probe.sphericalHarmonic.l22.y);
            shCoef.push(probe.sphericalHarmonic.l22.z);

            shCoef.push(probe.sphericalHarmonic.l21.x);
            shCoef.push(probe.sphericalHarmonic.l21.y);
            shCoef.push(probe.sphericalHarmonic.l21.z);

            shCoef.push(probe.sphericalHarmonic.l20.x);
            shCoef.push(probe.sphericalHarmonic.l20.y);
            shCoef.push(probe.sphericalHarmonic.l20.z);

            shCoef.push(probe.sphericalHarmonic.l2_1.x);
            shCoef.push(probe.sphericalHarmonic.l2_1.y);
            shCoef.push(probe.sphericalHarmonic.l2_1.z);

            shCoef.push(probe.sphericalHarmonic.l2_2.x);
            shCoef.push(probe.sphericalHarmonic.l2_2.y);
            shCoef.push(probe.sphericalHarmonic.l2_2.z);
        }
        irradianceMaterial.setArray3("probePosition", probePosition);
        irradianceMaterial.setArray3("shCoef", shCoef);

        if (this._uniformBottomLeft != null){
            irradianceMaterial.setInt("isUniform", 1);
            irradianceMaterial.setVector3("numberProbesInSpace", this._uniformNumberProbes);
            irradianceMaterial.setVector3("boxSize", this._uniformBoxSize);
            irradianceMaterial.setVector3("bottomLeft", this._uniformBottomLeft);
        }

        irradianceMaterial.backFaceCulling = false;

        let previousMaterial = new Array<Nullable<Material>>();
        
        this.irradianceLightmap.onBeforeRenderObservable.add(() => {
            //Add the right material to the meshes
            for ( let mesh of this.meshes ){
                previousMaterial.push(mesh.material);
                mesh.material = irradianceMaterial;
            }
        });

        this.irradianceLightmap.onAfterRenderObservable.add(() => {
            //Put the previous material on the meshes
            for ( let i =  0; i < this.meshes.length; i++ ) {
                this.meshes[i].material = previousMaterial[i];
            }
        });
    }

}