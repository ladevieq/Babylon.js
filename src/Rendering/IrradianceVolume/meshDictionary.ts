import { Mesh } from "../../Meshes/mesh";
import { Nullable } from '../../types';
import { Texture } from '../../Materials/Textures/texture';
import { Scene } from '../../scene';
import { PBRMaterial } from '../../Materials/PBR/pbrMaterial';
import { Color4 } from '../../Maths/math.color';
import { MultiRenderTarget } from '../../Materials/Textures/multiRenderTarget';
import { IrradiancePostProcessEffectManager } from './irradiancePostProcessEffectManager';
import { VertexBuffer } from '../../Meshes/buffer';
import { Material } from '../../Materials/material';
import { InternalTexture } from '../../Materials/Textures/internalTexture';
import { RenderTargetTexture } from '../../Materials/Textures/renderTargetTexture';

/**
 * Interface that contains the different textures that are linked to a mesh
 */
export interface IMeshesGroup {
    //The lightmap that contains information about direct illumination
    directLightmap : Nullable<Texture>;

    irradianceLightmap : RenderTargetTexture;

    dilateLightmap : RenderTargetTexture;

    sumOfBothLightmap : RenderTargetTexture;

    toneMapLightmap : RenderTargetTexture;

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

    private _postProcessManager : IrradiancePostProcessEffectManager;

    public globalIllumStrength = 1;
    public directIllumStrength = 1;

    public frameBuffer1 : WebGLFramebuffer;

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
        this.frameBuffer1 = <WebGLFramebuffer>(scene.getEngine()._gl.createFramebuffer());
    }

    private _add(mesh : Mesh) : void {
        this._keys.push(mesh);
        let meshTexture = <IMeshesGroup> {};
        this._values.push(meshTexture);
    }

    /**
     * Initialize the lightmap that are not the directIllumination
     * Must be called once
     */
    public initLightmapTextures() : void {
        this._postProcessManager = new IrradiancePostProcessEffectManager(this._scene);
        for (let mesh of this._keys) {
            let value = this.getValue(mesh);
            if (value != null) {
                let size = 128;
                value.irradianceLightmap = new RenderTargetTexture("irradiance", size, this._scene, false, true, 1, false, 2);
                value.toneMapLightmap = new RenderTargetTexture("toneMap", size, this._scene, false, true, 1, false, 2);
                value.dilateLightmap = new RenderTargetTexture("dilate", size, this._scene, false, true, 1, false, 2);
                value.sumOfBothLightmap = new RenderTargetTexture("sumOfBoth", size, this._scene, false, true, 1, false, 2);
            }
        }

    }

    public render() {
        for (let value of this._values) {
            this.renderValue(value);
        }
    }

    public renderValue(value : IMeshesGroup) {
        this._dilateRendering(value);
        this._sumOfBothRendering(value);
        this._toneMappingRendering(value);
        value.toneMapLightmap.coordinatesIndex = 1;
        let mesh = this._getMesh(value);
        if (mesh != null) {
            (<PBRMaterial> mesh.material).lightmapTexture = value.toneMapLightmap;
        }
    }

    private _sumOfBothRendering(value : IMeshesGroup) : void {
        let engine = this._scene.getEngine();
        let effect = this._postProcessManager.sumOfBothEffect;

        let dest = value.sumOfBothLightmap;

        engine.enableEffect(effect);
        engine.setState(false);
        let gl = engine._gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer1);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,  (<InternalTexture>dest._texture)._webGLTexture, 0);

        engine.clear(new Color4(0.0, 0.0, 0.0, 0.0), true, true, true);
        let vb: any = {};
        vb[VertexBuffer.PositionKind] = this._postProcessManager.screenQuadVB;
        effect.setTexture("texture1", value.directLightmap);
        effect.setTexture("texture2", value.dilateLightmap);
        effect.setFloat("directIllumStrength", this.directIllumStrength);
        effect.setFloat("globalIllumStrength", this.globalIllumStrength);
        engine.bindBuffers(vb, this._postProcessManager.screenQuadIB, effect);

        engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
        engine.drawElementsType(Material.TriangleFillMode, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    public _toneMappingRendering(value : IMeshesGroup) {
        let engine = this._scene.getEngine();
        let effect = this._postProcessManager.toneMappingEffect;

        let dest = value.toneMapLightmap;

        engine.enableEffect(effect);
        engine.setState(false);
        let gl = engine._gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer1);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, (<InternalTexture>dest._texture)._webGLTexture, 0);

        engine.clear(new Color4(0.0, 0.0, 0.0, 0.0), true, true, true);
        let vb: any = {};
        vb[VertexBuffer.PositionKind] = this._postProcessManager.screenQuadVB;
        effect.setTexture("inputTexture", value.sumOfBothLightmap);
        effect.setFloat("exposure", 1);
        engine.bindBuffers(vb, this._postProcessManager.screenQuadIB, effect);

        engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
        engine.drawElementsType(Material.TriangleFillMode, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    public _dilateRendering(value : IMeshesGroup) {
        let engine = this._scene.getEngine();
        let effect = this._postProcessManager.dilateEffect;
        let dest = value.dilateLightmap;

        engine.enableEffect(effect);
        engine.setState(false);
        let gl = engine._gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer1);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, (<InternalTexture>dest._texture)._webGLTexture, 0);

        engine.clear(new Color4(1.0, 0.0, 0.0, 1.0), true, true, true);
        gl.clearColor(1., 0., 0., 1.);
        let vb: any = {};
        vb[VertexBuffer.PositionKind] = this._postProcessManager.screenQuadVB;
        effect.setTexture("inputTexture", value.irradianceLightmap);
        effect.setFloat2("texelSize", 1 / dest.getSize().width, 1 / dest.getSize().height);
        engine.bindBuffers(vb, this._postProcessManager.screenQuadIB, effect);

        engine.setDirectViewport(0, 0, dest.getSize().width, dest.getSize().height);
        engine.drawElementsType(Material.TriangleFillMode, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Functions called to check if the materials are ready for rendering
     */
    public areMaterialReady() : boolean {
        return this._postProcessManager.isReady();
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
