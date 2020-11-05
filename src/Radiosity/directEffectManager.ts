import { Scene } from '..';
import { Effect } from '../Materials';
import { VertexBuffer, DataBuffer } from '../Meshes';

import '../Shaders/visibility.fragment';
import '../Shaders/visibility.vertex';
import '../Shaders/shadowMapping.fragment';
import '../Shaders/shadowMapping.vertex';

/**
  * Creates various effects to solve radiosity.
  */
export class DirectEffectsManager {
    /**
      * Effect for visibility
      */
    public opaqueVisibilityEffect: Effect;

    public alphaVisibilityEffect: Effect;

    public shadowMappingEffect: Effect;

    private _effectsPromise: Promise<void[]>;

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
        this._effectsPromise = this._createEffects();
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

    private _createEffects(): Promise<void[]> {
        return Promise.all([
              this._isOpaqueVisiblityEffectReady(),
              this._isAlphaVisiblityEffectReady(),
              this._isShadowMappingEffectReady(),
          ]);
    }

    /**
      * Checks the ready state of all the effets
      * @returns true if all the effects are ready
      */
    public isReady(): Promise<void[]> {
        return this._effectsPromise;
    }

    /**
     * Checks the ready state of the visibility effect
     * @returns true if the visibility effect is ready
     */
    private _isOpaqueVisiblityEffectReady(): Promise<void> {
        return new Promise((resolve) => {
            const attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind];
            const uniforms = ["world", "view", "projection", "nearFar", "bias", "lightPos", "normalBias"];

            this.opaqueVisibilityEffect = this._scene.getEngine().createEffect(
                "visibility",
                attribs,
                uniforms,
                [],
                "",
                undefined,
                (_) => resolve()
            );
        });
    }

    /**
     * Checks the ready state of the visibility effect
     * @returns true if the visibility effect is ready
     */
    private _isAlphaVisiblityEffectReady(): Promise<void> {
        return new Promise((resolve) => {
            const attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind];
            const uniforms = ["world", "view", "projection", "nearFar", "bias", "lightPos", "normalBias"];
            const samplers = ["alphaTexture"];

            this.alphaVisibilityEffect = this._scene.getEngine().createEffect(
                "visibility",
                attribs,
                uniforms,
                samplers,
                "#define ALPHA\n",
                undefined,
                (_) => resolve()
            );
        });
    }

    /**
     * Checks the ready state of the tonemap effect
     * @returns A promise resolving when the effect is compiled
     */
    private _isShadowMappingEffectReady(): Promise<void> {
        return new Promise((resolve) => {
            const attribs: string[] = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UV2Kind];
            const uniforms: string[] = ["world", "view", "nearFar", "lightPos", "sampleCount", "radius", "intensity"];
            const samplers: string[] = ["depthMap", "gatherTexture"];

            this.shadowMappingEffect = this._scene.getEngine().createEffect(
                "shadowMapping",
                attribs,
                uniforms,
                samplers,
                "",
                undefined,
                () => resolve()
            );
        });
    }
}
