import { Effect } from "../Materials/effect";
import { VertexBuffer } from "../Meshes/buffer";
import { Scene } from "../scene";

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
    public visibilityEffect: Effect;
    /**
      * Effect to tonemap the lightmap. Necessary to map the dynamic range into 0;1.
      */
    public radiosityPostProcessEffect: Effect;

    public shadowMappingEffect: Effect;

    public effectPromise: Promise<void>;

    private _scene: Scene;

    /**
      * Creates the manager
      * @param scene The current scene
      * @param useHemicube If true, uses hemicube instead of hemispherical projection
      * @param useDepthCompare If true, uses depth instead of surface id for visibility
      */
    constructor(scene: Scene) {
        this._scene = scene;

        this.effectPromise = this.createEffects();
    }

    private createEffects(): Promise<void> {
        return new Promise((resolve, reject) => {
            let interval = setInterval(() => {
                let readyStates = [
                    this.isVisiblityEffectReady(),
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
        return  this.isVisiblityEffectReady() &&
                this.isRadiosityPostProcessReady() &&
                this.isShadowMappingEffectReady();
    }


    /**
     * Checks the ready state of the visibility effect
     * @returns true if the visibility effect is ready
     */
    public isVisiblityEffectReady(): boolean {
        const attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind];
        const uniforms = ["world", "view", "projection", "nearFar", "bias", "lightPos", "normalBias"];

        this.visibilityEffect = this._scene.getEngine().createEffect("visibility",
            attribs,
            uniforms,
            [], "");

        return this.visibilityEffect.isReady();
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
