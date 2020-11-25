import { Scene } from '../..';
import { Color4, SphericalHarmonics, Vector3, Matrix } from '../../Maths';
import { Material, StandardMaterial, PBRMaterial, Effect, InternalTexture, RenderTargetTexture, ShaderMaterial } from '../../Materials';
import { SmartArray, CubeMapToSphericalPolynomialTools } from '../../Misc';
import { UniversalCamera } from '../../Cameras';
import { Constants } from '../../Engines';
import { VertexBuffer, Mesh, SubMesh, TransformNode } from '../../Meshes';

import '../../Shaders/irradianceVolumeComputeIrradiance.vertex';
import '../../Shaders/irradianceVolumeComputeIrradiance.fragment';

import { MeshDictionary } from './meshDictionary';

/**
 * The probe is what is used for irradiance volume
 * It aims to sample the irradiance at  a certain point of the scene
 * For that, it create a cube map of its environment that will be used to compute the irradiance at that point
 */
export class Probe {

    // Status of the probe in the irradiance volume, according to the house
    public static readonly OUTSIDE_HOUSE : number = 0;
    public static readonly INSIDE_HOUSE : number = 1;

    // Resolution of the RTT to render the probes
    public static readonly RESOLUTION : number = 16;

    /**
     * Static number to access to the cameras with their direction
     */
    public static readonly PX : number = 0;
    public static readonly NX : number = 1;
    public static readonly PY : number = 2;
    public static readonly NY : number = 3;
    public static readonly PZ : number = 4;
    public static readonly NZ : number = 5;

    private _scene : Scene;

    /**
     * The list of camera that are attached to the probe,
     * used to render the cube map
     */
    public cameraList : Array<UniversalCamera>;

    /**
     * Effect that will capture the environment of the probes
     */
    public captureEnvironmentEffect : Effect;

    /**
     * The position of the probe
     */
    public position : Vector3;

    /**
     * The node which is the point that will represent the probe
     */
    public transformNode : TransformNode;

    /**
     * Instance of the dictionary that stores all the lightmaps
     */
    public dictionary : MeshDictionary;

    /**
     * The spherical harmonic coefficients that represent the irradiance capture by the probe
     */
    public sphericalHarmonic : SphericalHarmonics;

    /**
     * The spherical harmonic weight
     */
    public sphericalHarmonicsWeight: number = 1;

    /**
     * RenderTargetTexture that aims to copy the cubicMRT envCubeMap and add the irradiance compute previously to it, to simulate the bounces of the light
     */
    public environmentProbeTexture : RenderTargetTexture;

    /**
     * Variable helpful and use to know when the environment cube map has been rendered to continue the process
     */
    public envCubeMapRendered = false;

    /**
     * Factor with which the environment color is multiply when rendering the environment
     */
    public envMultiplicator = 1;

    /**
     * Status of the probe in the irradiance volume, according to the house
     */
    public probeInHouse = Probe.OUTSIDE_HOUSE;

    /**
     * The sphere that represents the probe if we want to display them
     */
    public sphere : Mesh;

    /**
     * Create the probe used to capture the irradiance at a point
     * @param position The position at which the probe is set
     * @param scene the scene in which the probe is place
     * @param inRoom 1 if the probe is in the house, 0 otherwise 
     */
    constructor(position : Vector3, scene : Scene, inRoom : number, sphericalHaromicsWeight: number) {
        this._scene = scene;
        this.position = position;
        this.transformNode = new TransformNode("node", this._scene);
        this.probeInHouse = inRoom;
        this.cameraList = new Array<UniversalCamera>();
        this.sphericalHarmonicsWeight = sphericalHaromicsWeight;

        //First Camera ( x axis )
        let cameraPX = new UniversalCamera("px", Vector3.Zero(), scene);
        cameraPX.rotation = new Vector3(0, Math.PI / 2, 0);
        this.cameraList.push(cameraPX);

        //Second Camera ( - x  axis )
        let cameraNX = new UniversalCamera("nx", Vector3.Zero(), scene);
        cameraNX.rotation = new Vector3(0, - Math.PI / 2, 0);
        this.cameraList.push(cameraNX);

        //Third Camera ( y axis )
        let cameraPY = new UniversalCamera("py", Vector3.Zero(), scene);
        cameraPY.rotation = new Vector3(Math.PI / 2, 0, 0);
        this.cameraList.push(cameraPY);

        //Fourth Camera ( - y axis )
        let cameraNY = new UniversalCamera("ny", Vector3.Zero(), scene);
        cameraNY.rotation = new Vector3(- Math.PI / 2, 0, 0);
        this.cameraList.push(cameraNY);

        //Fifth Camera ( z axis )
        let cameraPZ = new UniversalCamera("pz", Vector3.Zero(), scene);
        cameraPZ.rotation = new Vector3(0, 0, 0);
        this.cameraList.push(cameraPZ);

        //Sixth Camera ( - z axis )
        let cameraNZ = new UniversalCamera("nz", Vector3.Zero(), scene);
        cameraNZ.rotation = new Vector3(0, Math.PI, 0);
        this.cameraList.push(cameraNZ);

        //Change the attributes of all cameras
        for (let camera of this.cameraList) {
            camera.parent = this.transformNode;
        }
        this.transformNode.translate(position, 1);
        this.sphericalHarmonic = new SphericalHarmonics();

        this._initEnvironmentProbeTexture();
    }

    public dispose() {
        this.cameraList.forEach(c => c.dispose());

        if (this.probeInHouse == Probe.INSIDE_HOUSE) {
            this.environmentProbeTexture.dispose();
        }
    }

    /**
     * Add a parent to the probe
     * @param parent The parent to be added
     */
    public setParent(parent : Mesh): void {
        this.transformNode.parent = parent;
    }

    protected _renderCubeTexture(subMeshes : SmartArray<SubMesh>, faceIndex : number) : void {
        var renderSubMesh = (subMesh : SubMesh, effect : Effect, view : Matrix, projection : Matrix) => {
            let mesh = subMesh.getRenderingMesh();
            mesh._bind(subMesh, effect, Material.TriangleFillMode);
            mesh.cullingStrategy = Constants.MESHES_CULLINGSTRATEGY_OPTIMISTIC_INCLUSION;

            if (subMesh.verticesCount === 0) {
                return;
            }

            effect.setMatrix("view", view);
            effect.setMatrix("projection", projection);
            if (mesh.material != null) {
                if (mesh.material instanceof PBRMaterial) {
                    const hasTexture = Boolean(mesh.material?.albedoTexture);
                    effect.setColor3("albedoColor", mesh.material.albedoColor);
                    effect.setBool("hasTexture", hasTexture);
                    if (hasTexture) {
                        effect.setTexture("albedoTexture", mesh.material.albedoTexture);
                    }
                } else if (mesh.material instanceof StandardMaterial) {
                    const hasTexture = Boolean(mesh.material?.diffuseTexture);
                    effect.setColor3("albedbounceoColor", mesh.material.diffuseColor);
                    effect.setBool("hasTexture", hasTexture);
                    if (hasTexture) {
                        effect.setTexture("albedoTexture", mesh.material.diffuseTexture);
                    }
                }
            } else {
                console.warn("No material present on the mesh : ", mesh);
            }

            effect.setFloat("envMultiplicator", this.envMultiplicator);
            effect.setVector3("probePosition", this.position);

            let value = this.dictionary.getValue(mesh);
            if (value != null) {
                // TODO: May cause troubles
                // Is fully black on first run
                effect.setTexture("irradianceMap", value.irradianceLightmap);
                effect.setTexture("directIlluminationLightmap", value.directLightmap);
            }

            var batch = mesh._getInstancesRenderList(subMesh._id);
            if (batch.mustReturn) {
                return;
            }

            var hardwareInstanceRendering = (engine.getCaps().instancedArrays) && (batch.visibleInstances[subMesh._id] !== null);
            mesh._processRendering(mesh, subMesh, effect, Material.TriangleFillMode, batch, hardwareInstanceRendering,
                (_, world) => effect.setMatrix("world", world));
        };

        let scene = this._scene;
        let engine = scene.getEngine();
        let gl = engine._gl;

        let internalTexture = <InternalTexture>this.environmentProbeTexture.getInternalTexture();
        let effect = this.captureEnvironmentEffect;

        gl.bindFramebuffer(gl.FRAMEBUFFER, internalTexture._framebuffer);
        engine.setState(true, 0, true, scene.useRightHandedSystem);

        let viewMatrices = [ this.cameraList[Probe.PX].getViewMatrix(),
            this.cameraList[Probe.NX].getViewMatrix(),
            this.cameraList[Probe.PY].getViewMatrix(),
            this.cameraList[Probe.NY].getViewMatrix(),
            this.cameraList[Probe.PZ].getViewMatrix(),
            this.cameraList[Probe.NZ].getViewMatrix()
        ];

        let projectionMatrix =  Matrix.PerspectiveFovLH(Math.PI / 2, 1, 0.1, this.cameraList[0].maxZ);

        let cubeSides = [
            gl.TEXTURE_CUBE_MAP_POSITIVE_X,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
        ];

        engine.enableEffect(effect);

        engine.setDirectViewport(0, 0, this.environmentProbeTexture.getRenderWidth(), this.environmentProbeTexture.getRenderHeight());
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, cubeSides[faceIndex], internalTexture._webGLTexture, 0);

        engine.clear(new Color4(0, 0, 0, 0), true, true);
        for (let i = 0; i < subMeshes.length; i++) {
            renderSubMesh(subMeshes.data[i], effect, viewMatrices[faceIndex], projectionMatrix);
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Initialize the method that were created in a promise
     * @param dictionary  The dictionary that contains all the lightmap
     * @param captureEnvironmentEffect The effect that render the environment of the probes
     */
    public initForRendering(dictionary : MeshDictionary, captureEnvironmentEffect : Effect) : void {
        this.dictionary = dictionary;
        this.captureEnvironmentEffect = captureEnvironmentEffect;
    }

    /**
     * Initialize the custom render function of the environmentProbeTexture
     * It will be rendered once per bounce, per mesh
     * @param meshes The meshes to be rendered in the irradiance volume
     */
    public initEnvironmentRenderer(meshes : Array<Mesh>) : void {
        if (this.probeInHouse == Probe.INSIDE_HOUSE) {
            this.environmentProbeTexture.renderList = meshes;
            this.environmentProbeTexture.boundingBoxPosition = this.position;
            let faceIndexForRender = 0;

            this.environmentProbeTexture.onBeforeRenderObservable.add((faceIndex) => {
                faceIndexForRender = faceIndex;
            });

            this.environmentProbeTexture.customRenderFunction = (
                opaqueSubMeshes: SmartArray<SubMesh>,
                _alphaTestSubMeshes: SmartArray<SubMesh>,
                _transparentSubMeshes: SmartArray<SubMesh>,
                _depthOnlySubMeshes: SmartArray<SubMesh>): void => {
                    this._renderCubeTexture(opaqueSubMeshes, faceIndexForRender);
            };
        }
    }

    /**
     * Initialise what need time to be ready
     * Is called in irradiance for the creation of the promise
     */
    private _initEnvironmentProbeTexture() : void {
        if (this.probeInHouse == Probe.INSIDE_HOUSE) {
            this.environmentProbeTexture = new RenderTargetTexture("tempLightBounce", Probe.RESOLUTION, this._scene, undefined, true, Constants.TEXTURETYPE_FLOAT, true);
        }
    }

    /**
     * Compute the sh coefficient, coming from the environment texture capture by the probes
     */
    public CPUcomputeSHCoeff() : void {
        let sp = CubeMapToSphericalPolynomialTools.ConvertCubeMapTextureToSphericalPolynomial(this.environmentProbeTexture);
        if (sp != null) {
            this.sphericalHarmonic = SphericalHarmonics.FromPolynomial(sp);
            this.sphericalHarmonic.scaleInPlace(this.sphericalHarmonicsWeight);
        }
    }

    private _computeProbeIrradiance() : void {
        //We use a shader to add this texture to the probe
        let shaderMaterial = new ShaderMaterial("irradianceOnSphere", this._scene, "irradianceVolumeComputeIrradiance", {
            attributes : [VertexBuffer.PositionKind, VertexBuffer.NormalKind],
            uniforms : ["worldViewProjection", "L00", "L10", "L11", "L1m1", "L20", "L21", "L22", "L2m1", "L2m2"]
        });
        shaderMaterial.setVector3("L00", this.sphericalHarmonic.l00);

        shaderMaterial.setVector3("L10", this.sphericalHarmonic.l10);
        shaderMaterial.setVector3("L11", this.sphericalHarmonic.l11);
        shaderMaterial.setVector3("L1m1", this.sphericalHarmonic.l1_1);

        shaderMaterial.setVector3("L20", this.sphericalHarmonic.l20);
        shaderMaterial.setVector3("L21", this.sphericalHarmonic.l21);
        shaderMaterial.setVector3("L22", this.sphericalHarmonic.l22);
        shaderMaterial.setVector3("L2m1", this.sphericalHarmonic.l2_1);
        shaderMaterial.setVector3("L2m2", this.sphericalHarmonic.l2_2);

        if (this.probeInHouse == Probe.INSIDE_HOUSE) {
            this.sphere.material = shaderMaterial;
        }

    }

    public createSphere() : void {
        if (this.probeInHouse != Probe.OUTSIDE_HOUSE) {
            this.sphere = Mesh.CreateSphere("sphere", 32, 30, this._scene);
            this.sphere.position = this.position;
            this._computeProbeIrradiance();
        }
    }

}
