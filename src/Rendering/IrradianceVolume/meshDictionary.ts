import { Nullable, Scene } from '../..';
import { Mesh } from '../../Meshes';
import { Effect, StandardMaterial, PBRMaterial, Texture, RenderTargetTexture, InternalTexture } from '../../Materials';
import { Constants } from '../../Engines';
import { PostProcess } from '../../PostProcesses';

/**
 * Interface that contains the different textures that are linked to a mesh
 */
export interface IMeshesGroup {
    //The lightmap that contains information about direct illumination
    directLightmap : Texture;

    // The lightmap used to store the irradiance
    irradianceLightmap : RenderTargetTexture;

    // The postProcessed irradiance map
    result: RenderTargetTexture;
}

/**
 * This dictionary contains meshes as key and textures are value
 * In our implementation, we create one lightmap per mesh
 * The dictionary allows to find quickly the texture linked to the meshes
 */
export class MeshDictionary {

    private _keys : Mesh[];
    private _values : IMeshesGroup[];
    private _scene : Scene;

    public globalIllumStrength = 1;
    public directIllumStrength = 1;

    private _renderingMesh: Nullable<IMeshesGroup>;

    private _postProcesses: PostProcess[] = [];

    protected _dilatePostProcess: PostProcess;
    protected _sumOfBothPostProcess: PostProcess;

    /**
     * Create the dictionary
     * Each mesh of meshes will be a key
     * @param meshes The meshes that are stored inside the dictionary
     * @param scene The scene
     */
    constructor(meshes : Mesh[], scene : Scene) {
        this._keys = [];
        this._values = [];
        this._scene = scene;

        for (let mesh of meshes) {
            this._add(mesh);
        }

        this._initializeDilatePostProcess();
        this._initializeSumOfBothPostProcess();

        while (!this._dilatePostProcess.isReady() ||
            !this._sumOfBothPostProcess.isReady()) {
        }
    }

    public dispose() {
        this._values.forEach((textures) => {
            if (textures.irradianceLightmap) {
                textures.irradianceLightmap.dispose();
            }
            if (textures.directLightmap) {
                textures.directLightmap.dispose();
            }

            if (textures.result) {
                textures.result.dispose();
            }
        });
    }

    public initIrradianceTextures(): void {
        this._keys.forEach(mesh => {
            const textures = this.getValue(mesh);

            if (textures) {
                (<IMeshesGroup>textures).irradianceLightmap = new RenderTargetTexture(
                    "irradiance",
                    mesh.directInfo.shadowMapSize,
                    this._scene,
                    false,
                    true,
                    Constants.TEXTURETYPE_FLOAT,
                    false,
                    Constants.TEXTURE_BILINEAR_SAMPLINGMODE
                );
            }
        });
    }

    private _initializeDilatePostProcess() {
        const engine = this._scene.getEngine();
        const uniforms = ["texelSize"];
        const samplers: Array<string> = [];

        this._dilatePostProcess = new PostProcess("dilate", "dilate", uniforms, samplers, 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, null, Constants.TEXTURETYPE_FLOAT);
        this._dilatePostProcess.onApplyObservable.add((effect) => {
            effect.setFloat2("texelSize", 1 / this._dilatePostProcess.width, 1 / this._dilatePostProcess.height);
        });
        this._dilatePostProcess.autoClear = false;

        this._postProcesses.push(this._dilatePostProcess);
    }

    private _initializeSumOfBothPostProcess() {
        const engine = this._scene.getEngine();
        const uniforms = ["directIllumStrength", "globalIllumStrength"];
        const samplers = ["directSampler"];

        this._sumOfBothPostProcess = new PostProcess("sumOfBoth", "irradianceVolumeMixTwoTextures", uniforms, samplers, 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, null, Constants.TEXTURETYPE_FLOAT);
        this._sumOfBothPostProcess.onApplyObservable.add((effect: Effect) => {
            effect.setTexture("directSampler", <Texture>this._renderingMesh?.directLightmap);
            effect.setFloat("directIllumStrength", this.directIllumStrength);
            effect.setFloat("globalIllumStrength", this.globalIllumStrength);
        });
        this._sumOfBothPostProcess.autoClear = false;

        this._postProcesses.push(this._sumOfBothPostProcess);
    }

    /**
     * Render all the postProcess lightmap of every mesh
     * We do not render the irradianceLightmap and the direct Lightmap
     */
    public render() {
        for (let value of this._values) {
            this._renderingMesh = value;
            const mesh = this._getMesh(value);
            if (this._renderingMesh && mesh) {
                this._renderingMesh.result = mesh.directInfo.tempTexture;

                this._dilatePostProcess.inputTexture = <InternalTexture>value.irradianceLightmap.getInternalTexture();
                this._dilatePostProcess.width = value.irradianceLightmap.getRenderWidth();
                this._dilatePostProcess.height = value.irradianceLightmap.getRenderHeight();
                this._scene.postProcessManager.directRender(this._postProcesses, this._renderingMesh.result.getInternalTexture(), true);

                if (mesh.material instanceof PBRMaterial || mesh.material instanceof StandardMaterial) {
                    mesh.material.lightmapTexture = this._renderingMesh.result;
                    mesh.material.lightmapTexture.coordinatesIndex = 1;
                }
            }
        }
    }

    private _add(mesh : Mesh) : void {
        this._keys.push(mesh);
        this._values.push(<IMeshesGroup> {});
    }

    /**
     * Return the list of meshes that are present in the dictionary
     */
    public keys() : Mesh[] {
        return this._keys;
    }

    /**
     * Return the list of light maps presents in the dictionary
     */
    public values() : IMeshesGroup[] {
        return this._values;
    }

    /**
     * Get the lightmaps associated to a mesh
     * @param mesh The mesh we want the value from
     */
    public getValue(mesh : Mesh) : Nullable<IMeshesGroup> {
        let index = this._containsKey(mesh);
        if (index != -1) {
            return this._values[index];
        }
        return null;
    }

    private _getMesh(value : IMeshesGroup) : Nullable<Mesh> {
        for (let i = 0; i < this._values.length; i++) {
            if (this._values[i] == value) {
                return this._keys[i];
            }
        }
        return null;
    }

    private _containsKey(key : Mesh) : number {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i] == key) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Update the value from the directlightmap
     * @param mesh The mesh we wants its lightmap to be update
     * @param lightmap The lightmap with which we are going to replace the previous one
     */
    public addDirectLightmap(mesh : Mesh, lightmap : Texture) : void {
        let value = this.getValue(mesh);
        if (value != null) {
            value.directLightmap = lightmap;
        }
    }

}
