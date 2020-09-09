import { Effect } from '../../Materials/effect';
import { Scene } from '../../scene';
import { VertexBuffer } from "../../Meshes/buffer";
import { DataBuffer } from "../../Meshes/dataBuffer";

import "../../Shaders/irradianceVolumeMixTwoTextures.fragment";
import "../../Shaders/irradianceVolumeMixTwoTextures.vertex";
import "../../Shaders/radiosityPostProcess.fragment";
import "../../Shaders/radiosityPostProcess.vertex";
import "../../Shaders/dilate.vertex";
import "../../Shaders/dilate.fragment";


/**
 * Class that takes care of initializing the effects used in the postProcess
 */
export class IrradiancePostProcessEffectManager {

    /**
     * The effect to sum the direct and indirect light
     */
    public sumOfBothEffect : Effect;

    /**
     * The effect that applies tonemapping
     */
    public toneMappingEffect : Effect;

    /**
     * The effect that dilate the lightmap
     */
    public dilateEffect : Effect;

    private _scene : Scene;
    private _vertexBuffer : VertexBuffer;
    private _indexBuffer : DataBuffer;

    constructor(scene : Scene) {
        this._scene = scene;

        this.prepareBuffers();
        this.createEffects();
    }

    /**
      * Gets a screen quad vertex buffer
      */
     public get screenQuadVB(): VertexBuffer {
        return this._vertexBuffer;
    }

    /**
      * Gets a screen quad index buffer
      */
    public get screenQuadIB(): DataBuffer {
        return this._indexBuffer;
    }

    private createEffects(): Promise<void> {

        return new Promise((resolve, reject) => {
            let interval = setInterval(() => {
                let readyStates = [
                    this.isSumOfBothEffectReady(),
                    this.isToneMappingEffectReady(),
                    this.isDilateEffectReady()
                ];

                for (let i = 0; i < readyStates.length; i++) {
                    if (!readyStates[i]) {
                        return;
                    }
                }

                clearInterval(interval);
                resolve();
            }, 200);
        });
    }

     /**
      * Checks the ready state of all the effets
      * @returns true if all the effects are ready
      */
     public isReady(): boolean {
        return this.isSumOfBothEffectReady() &&
        this.isToneMappingEffectReady() &&
        this.isDilateEffectReady();
    }

    private prepareBuffers(): void {
        if (this._vertexBuffer) {
            return;
        }

        // VBO
        var vertices = [];
        vertices.push(1, 1);
        vertices.push(-1, 1);
        vertices.push(-1, -1);
        vertices.push(1, -1);

        this._vertexBuffer = new VertexBuffer(this._scene.getEngine(), vertices, VertexBuffer.PositionKind, false, false, 2);

        this._buildIndexBuffer();
    }

    private _buildIndexBuffer(): void {
        // Indices
        var indices = [];
        indices.push(0);
        indices.push(1);
        indices.push(2);

        indices.push(0);
        indices.push(2);
        indices.push(3);

        this._indexBuffer = this._scene.getEngine().createIndexBuffer(indices);
    }

    public isSumOfBothEffectReady(): boolean {
        this.sumOfBothEffect = this._scene.getEngine().createEffect("irradianceVolumeMixTwoTextures",
            [VertexBuffer.PositionKind],
            ["globalIllumStrength", "directIllumStrength"],
            ["texture1", "texture2"], "");
        return this.sumOfBothEffect.isReady();
    }

    public isToneMappingEffectReady() : boolean {
        this.toneMappingEffect = this._scene.getEngine().createEffect("radiosityPostProcess",
            [VertexBuffer.PositionKind],
            ["_ExposureAdjusment"],
            ["inputTexture"], "");
        return this.toneMappingEffect.isReady();
    }

    public isDilateEffectReady() : boolean {
        this.dilateEffect = this._scene.getEngine().createEffect("dilate",
            [VertexBuffer.PositionKind],
            ["offset", "texelSize"],
            ["inputTexture"], "");

        return this.dilateEffect.isReady();
    }

}
