import { Effect } from "../Materials/effect";
import { VertexBuffer } from "../Meshes/buffer";
import { Scene } from "../scene";
import { DataBuffer } from "../Meshes/dataBuffer";

import "../Shaders/visibility.fragment";
import "../Shaders/visibility.vertex";
import "../Shaders/dilate.fragment";
import "../Shaders/radiosityPostProcess.fragment";
import "../Shaders/radiosityPostProcess.vertex";
import "../Shaders/shadowMapping.fragment";
import "../Shaders/shadowMapping.vertex";

/**
  * Creates various effects to solve radiosity.
  */
export class DirectEffectsManager {
    /**
      * Effect for visibility
      */
    public opaqueVisibilityEffect: Effect;
    public alphaVisibilityEffect: Effect;

    /**
      * Effect to tonemap the lightmap. Necessary to map the dynamic range into 0;1.
      */
    public radiosityPostProcessEffect: Effect;

    public shadowMappingEffect: Effect;

    public effectPromise: Promise<void>;

    private _scene: Scene;
    private _vertexBuffer : VertexBuffer;
    private _indexBuffer : DataBuffer;

    /**
      * Creates the manager
      * @param scene The current scene
      * @param useHemicube If true, uses hemicube instead of hemispherical projection
      * @param useDepthCompare If true, uses depth instead of surface id for visibility
      */
    constructor(scene: Scene) {
        this._scene = scene;

        this.prepareBuffers();
        this.effectPromise = this.createEffects();
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

    private createEffects(): Promise<void> {
        return new Promise((resolve, reject) => {
            let interval = setInterval(() => {
                let readyStates = [
                    this.isOpaqueVisiblityEffectReady(),
                    this.isAlphaVisiblityEffectReady(),
                    this.isRadiosityPostProcessReady(),
                    this.isShadowMappingEffectReady(),
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
        return  this.isOpaqueVisiblityEffectReady() &&
                this.isAlphaVisiblityEffectReady() &&
                this.isRadiosityPostProcessReady() &&
                this.isShadowMappingEffectReady();
    }

    /**
     * Checks the ready state of the visibility effect
     * @returns true if the visibility effect is ready
     */
    public isOpaqueVisiblityEffectReady(): boolean {
        const attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind];
        const uniforms = ["world", "view", "projection", "nearFar", "bias", "lightPos", "normalBias"];

        this.opaqueVisibilityEffect = this._scene.getEngine().createEffect("visibility",
            attribs,
            uniforms,
            [], "");

        return this.opaqueVisibilityEffect.isReady();
    }

    /**
     * Checks the ready state of the visibility effect
     * @returns true if the visibility effect is ready
     */
    public isAlphaVisiblityEffectReady(): boolean {
        const attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind];
        const uniforms = ["world", "view", "projection", "nearFar", "bias", "lightPos", "normalBias"];
        const samplers = ["alphaTexture"];

        this.alphaVisibilityEffect = this._scene.getEngine().createEffect("visibility",
            attribs,
            uniforms,
            samplers,
            "#define ALPHA\n");

        return this.alphaVisibilityEffect.isReady();
    }

    /**
     * Checks the ready state of the tonemap effect
     * @returns true if the tonemap effect is ready
     */
    public isRadiosityPostProcessReady(): boolean {
        this.radiosityPostProcessEffect = this._scene.getEngine().createEffect("radiosityPostProcess",
            [VertexBuffer.PositionKind],
            ["exposure"],
            ["inputTexture"], "");

        return this.radiosityPostProcessEffect.isReady();
    }

    /**
     * Checks the ready state of the tonemap effect
     * @returns true if the tonemap effect is ready
     */
    public isShadowMappingEffectReady(): boolean {
        const attribs: string[] = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UV2Kind];
        const uniforms: string[] = ["world", "view", "nearFar", "lightPos", "sampleCount"];
        const samplers: string[] = ["depthMap", "gatherTexture"];

        this.shadowMappingEffect = this._scene.getEngine().createEffect("shadowMapping",
            attribs,
            uniforms,
            samplers, "");

        return this.radiosityPostProcessEffect.isReady();
    }
}
