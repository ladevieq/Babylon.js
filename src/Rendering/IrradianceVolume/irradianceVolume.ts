import { Scene } from '../..';
import { Mesh } from '../../Meshes';
import { Vector3, Vector4 } from '../../Maths';

import { Probe } from './Probe';
import { MeshDictionary } from './meshDictionary';
import { Irradiance } from './Irradiance';

/**
 * Class that represent the irradiance volume
 * It contains all the probe used to render the scene, and is responsible of rendering the irradiance
 *
 */
export class IrradianceVolume {

    /**
     * List of probes that are used to render the scene
     */
    public probeList : Array<Probe>;

    /**
     * The list of meshes that are rendered in the irradiance volume
     */
    public meshForIrradiance : Array<Mesh>;

    /**
     * Instance of the irradiance class that aims to comput irradiance
     */
    public irradiance : Irradiance;

    /**
     * The dictionary that store all the lightmaps
     */
    public dictionary : MeshDictionary;

    private sphericalHarmonicsWeigth: number;

    private _scene : Scene;
    private _lowerLeft : Vector3;
    private _volumeSize : Vector3;

    /**
     * Creation of the irradiance volume
     * @param meshes  The meshes that need to be rendered by the probes
     * @param scene  The scene
     * @param numberBounces the number of bounces wanted
     * @param probeDisposition The disposition of the probes in the scene
     * @param numberProbes The number of probes placed on each axis
     */
    constructor(meshes : Array<Mesh>, scene : Scene,
        numberBounces : number,
        probeDisposition : Array<Vector4>,
        numberProbes : Vector3,
        sphericalHarmonicsWeight: number) {
        this._scene = scene;
        this.meshForIrradiance = meshes;
        this.probeList = [];
        this.sphericalHarmonicsWeigth = sphericalHarmonicsWeight;

        //Create and dispatch the probes inside the irradiance volume
        this._createProbeFromProbeDisp(probeDisposition);
        this._lowerLeft = new Vector3(probeDisposition[0].x, probeDisposition[0].y, probeDisposition[0].z);
        this._volumeSize = new Vector3(
            probeDisposition[probeDisposition.length - 1].x - this._lowerLeft.x,
            probeDisposition[probeDisposition.length - 1].y - this._lowerLeft.y,
            probeDisposition[probeDisposition.length - 1].z - this._lowerLeft.z
        );

        this.dictionary = new MeshDictionary(meshes, scene);
        this.irradiance = new Irradiance(this._scene, this.probeList, this.meshForIrradiance, this.dictionary,
            numberBounces, numberProbes, this._lowerLeft, this._volumeSize);
    }

    /**
     * Create the probes that are inside the volume
     * @param probeDisposition The list of position of the probes
     */
    private _createProbeFromProbeDisp(probeDisposition : Array<Vector4>) {
        for (let probePos of probeDisposition) {
            this.probeList.push(new Probe(new Vector3(probePos.x, probePos.y, probePos.z),
            this._scene, probePos.w, this.sphericalHarmonicsWeigth));
        }
    }

    /**
     * Called to change the directLightmap of the dictionary
     * Must ba called when the radiosity has been updates, othermwise, it does not do anything
     */
    public updateDicoDirectLightmap() {
        this.dictionary.keys().forEach(mesh => {
            this.dictionary.addDirectLightmap(mesh, mesh.getShadowMap());
        });
    }

    /**
     * Start rendering the irradiance volume
     */
    public render() {
        this.irradiance.render();
    }

    /**
     * Update the value of the globalIllumination Strength,
     * called after one rendering has been done
     * @param value 
     */
    public updateGlobalIllumStrength(value : number) {
        this.dictionary.globalIllumStrength = value;
        this.dictionary.render();
    }
    /**
     * Update the value of the directIllumination Strength,
     * called after one rendering has been done
     * @param value 
     */
    public updateDirectIllumStrength(value : number) {
        this.dictionary.directIllumStrength = value;
        this.dictionary.render();
    }

    public updateDirectIllumForEnv(envMultiplicator : number) {
        this.irradiance.updateDirectIllumForEnv(envMultiplicator);
    }
}
