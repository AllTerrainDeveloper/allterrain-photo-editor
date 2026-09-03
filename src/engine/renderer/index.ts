/**
 * The Pixi-backed render engine.
 *
 * The source texture is always full resolution, but interaction never pays for it.
 * Pixi runs a filter at the *rendered* size of the object it is attached to, and
 * the on-screen sprite is scaled to fit the viewport -- so dragging a slider on a
 * 6000px photograph costs the same as dragging one on a 1200px thumbnail. The
 * viewport is the proxy; there is no second texture to keep in sync.
 *
 * Saving re-runs the identical filter against the unscaled texture. The two agree
 * because every phase-1 op is per-pixel colour maths with no spatial radius, so the
 * result is genuinely resolution-independent. An op with a pixel radius -- blur,
 * sharpen, grain -- would break that and must scale its radius with the render size
 * when those land in a later phase.
 *
 * This module is the facade, and it is deliberately thin. What used to be
 * thirty-five methods on one class is now three groups a caller can be handed
 * separately -- `view`, `paint`, `pixels` -- plus the handful of verbs that act on the
 * engine as a whole.
 */

import { clampCanvas } from '../../model/document';
import type { CanvasSize, Layer } from '../../model/document';
import type { Histogram } from '../histogram';
import type { Curves, Levels } from '../lut';
import type { Op, WorkingSpace } from '../../model/recipe';
import type { OpSchema, RendererBackend } from '../../types';
import { assemble, sizeOf } from './assemble';
import type { Engine } from './assemble';
import type { DocumentCompositor } from './compositor';
import { GpuContext } from './gpu';
import type { GpuSprite, GpuTexture } from './gpu';
import type { HistogramProbe } from './histogram-probe';
import type { LayerTextures } from './layer-textures';
import { releaseImage } from './lifecycle';
import { renderFull } from './offscreen';
import type { PaintApi } from './paint-api';
import type { ViewController } from './view-controller';
import { rendererDebugState } from './debug';
import type { ScreenFilters } from './screen-filters';

export interface RendererOptions {
	/** Element the canvas fills. */
	host: HTMLElement;
	/**
	 * Refuse to render more than this many pixels in one pass.
	 *
	 * An RGBA render target costs four bytes per pixel of GPU memory, so a 100
	 * megapixel image wants 400MB in a single allocation and takes the tab down
	 * with it. Refusing with a clear message beats crashing.
	 */
	maxRenderPixels: number;
	/** Op table, used to skip adjustments sitting at rest. */
	schema: OpSchema;
	/** Which rendering backend to ask for. Defaults to WebGL. */
	backend?: RendererBackend;
}

export type { Viewport } from './camera';
export type { PixelRect } from './paint-ops';
export type { PaintApi } from './paint-api';
export type { ViewController } from './view-controller';

/**
 * Owns the canvas, the textures and the adjustment filter.
 */
export class EditorRenderer {
	/** Where the picture sits on screen: fit, zoom, pan, viewport. */
	readonly view: ViewController;

	/** Everything that writes pixels into a layer. */
	readonly paint: PaintApi;

	/** Reads off the composed document. */
	readonly pixels: DocumentCompositor;

	/** Which layer painting acts on. */
	activeLayerId = '';

	private gpu: GpuContext;

	private engine: Engine;

	private layers: LayerTextures;

	private histogram: HistogramProbe;

	private maxRenderPixels: number;

	/** Full-resolution texture. Never scaled; the source of truth for saving. */
	private texture: GpuTexture | null = null;

	/** Sprite shown on screen, scaled to fit the viewport. */
	private sprite: GpuSprite | null = null;

	private filters: ScreenFilters;

	/** The output surface. Independent of the layers drawn onto it. */
	private canvas: CanvasSize = { width: 0, height: 0 };

	/** The layer stack, back to front. */
	private stack: Layer[] = [];

	/**
	 * A layer left out of the composition without leaving the document.
	 *
	 * While a text layer's words are being retyped, the caret sits exactly where the
	 * rendered glyphs are; showing both would put two copies of the text on screen.
	 */
	private hidden: string | null = null;

	private destroyed = false;

	/**
	 * @param gpu     Drawing context.
	 * @param options Renderer options.
	 */
	private constructor( gpu: GpuContext, options: RendererOptions ) {
		this.gpu = gpu;
		this.maxRenderPixels = options.maxRenderPixels;

		const engine = assemble( gpu, options.host, options.schema, {
			canvas: () => this.canvas,
			source: () => this.texture,
			display: () => this.displayTexture(),
			sprite: () => this.sprite,
			onPaint: () => this.recompose(),
		} );

		this.engine = engine;
		this.filters = engine.filters;
		this.layers = engine.layers;
		this.histogram = engine.histogram;
		this.view = engine.view;
		this.paint = engine.paint;
		this.pixels = engine.compositor;
	}

	/**
	 * Boots Pixi and attaches a canvas to the host element.
	 *
	 * @param options Renderer options.
	 */
	static async create( options: RendererOptions ): Promise< EditorRenderer > {
		return new EditorRenderer(
			await GpuContext.create( options.host, options.backend ?? 'webgl' ),
			options
		);
	}

	/** The texture every downstream stage reads. */
	private displayTexture(): GpuTexture | null {
		return ( this.pixels.texture as GpuTexture | null ) ?? this.texture;
	}

	/** Size of the texture every downstream stage reads. */
	private displaySize(): CanvasSize {
		return sizeOf( this.displayTexture() );
	}

	/**
	 * Redraws the document and brings the display back in line with it.
	 *
	 * A newly created render texture starts on linear sampling, so the mode the
	 * current zoom calls for is re-applied rather than waiting for the next fit.
	 */
	private recompose(): void {
		this.pixels.compose( this.canvas, this.stack, this.texture, this.hidden );

		if ( this.sprite ) {
			const texture = this.displayTexture();

			if ( texture ) {
				this.sprite.texture = texture;
			}

			this.view.applySampling();
		}

		this.histogram.schedule();
	}

	/**
	 * Replaces the image being edited.
	 *
	 * @param image Decoded, untainted image element.
	 */
	setImage( image: HTMLImageElement ): void {
		this.releaseImage();

		this.texture = this.gpu.textureFrom( image );
		this.sprite = this.gpu.sprite( this.texture );
		this.sprite.anchor.set( 0.5 );

		this.filters.attach( this.sprite );
		this.gpu.stage.addChild( this.sprite );

		this.view.fit();
		this.histogram.schedule();
	}

	/** Tears down the texture, sprite and filter without touching the app. */
	private releaseImage(): void {
		this.sprite = releaseImage( this.engine, this.sprite, this.texture );
		this.texture = null;
	}

	/**
	 * Replaces the document and recomposes it.
	 *
	 * @param canvas        Output surface size.
	 * @param layers        Layer stack, back to front.
	 * @param activeLayerId Which layer painting acts on.
	 */
	setDocument( canvas: CanvasSize, layers: Layer[], activeLayerId: string ): void {
		this.canvas = clampCanvas( canvas, this.maxRenderPixels );
		this.stack = layers;
		this.activeLayerId = activeLayerId;

		this.recompose();
		this.view.fit();
	}

	/**
	 * Leaves one layer out of the picture, or puts it back.
	 *
	 * Not a document change: the layer is still there, still visible as far as the
	 * recipe is concerned, and comes back the moment this is cleared.
	 *
	 * @param layerId Layer to hide, or null to hide none.
	 */
	hideLayer( layerId: string | null ): void {
		if ( this.hidden === layerId ) {
			return;
		}

		this.hidden = layerId;
		this.recompose();
	}

	/**
	 * Frees textures for layers that can no longer come back.
	 *
	 * @param reachable Layer ids still referenced anywhere the user can return to.
	 */
	retainLayers( reachable: Set< string > ): void {
		this.layers.retain( new Set( this.stack.map( ( l ) => l.id ) ), reachable );
	}

	/**
	 * Rebuilds the tone table from curves and levels.
	 *
	 * @param curves Curve set.
	 * @param levels Levels.
	 */
	setTone( curves: Curves, levels: Levels ): void {
		this.filters.setTone( curves, levels );
		this.histogram.schedule();
	}

	/**
	 * Sets the adjustments to render.
	 *
	 * @param ops   Recipe ops.
	 * @param space Working space the adjustments are computed in.
	 */
	setOps( ops: Op[], space: WorkingSpace = 'srgb' ): void {
		this.filters.setOps( ops, space, this.blurTarget() );
		this.histogram.schedule();
	}

	/**
	 * Temporarily shows the unedited image, for a before/after comparison.
	 *
	 * The histogram deliberately keeps tracking the bypassed state too, so holding
	 * the compare key shows you both the original pixels and the original curve.
	 *
	 * @param bypass Whether to skip the adjustments.
	 */
	setBypass( bypass: boolean ): void {
		if ( this.filters.setBypass( bypass ) ) {
			this.histogram.schedule();
		}
	}

	/** The width a blur radius should be scaled against. */
	private blurTarget(): number {
		return this.view.viewport()?.width ?? this.displaySize().width;
	}

	/**
	 * Subscribes to histogram updates.
	 *
	 * @param listener Called after each recomputation.
	 * @return Unsubscribe function.
	 */
	onHistogram( listener: ( histogram: Histogram ) => void ): () => void {
		return this.histogram.subscribe( listener );
	}

	/** Reads the image alone, with every painted layer left out. */
	readPristinePixels() {
		return this.pixels.readPristine( this.canvas, this.stack, this.texture );
	}

	/** The current output surface size. */
	get canvasSize(): CanvasSize {
		return { ...this.canvas };
	}

	/** Native pixel dimensions of the loaded image. */
	get imageSize(): CanvasSize {
		return {
			width: this.texture?.width ?? 0,
			height: this.texture?.height ?? 0,
		};
	}

	/**
	 * Pixel dimensions of what the edit currently produces.
	 *
	 * The canvas size once a document is composed -- which is what the save path and
	 * the info panel both want.
	 */
	get sourceSize(): CanvasSize {
		return this.displaySize();
	}

	/**
	 * Renders the edit at full resolution and encodes it.
	 *
	 * @param format  Output MIME type.
	 * @param quality Encoder quality, 0..1. Ignored for PNG.
	 * @return The encoded image.
	 * @throws {Error} When the image is too large, or encoding fails.
	 */
	renderFull( format: string, quality: number ): Promise< Blob > {
		return renderFull( this.engine.offscreen, format, quality, this.maxRenderPixels );
	}

	/**
	 * Encodes one layer's pixels as a PNG, for saving beside the recipe.
	 *
	 * @param layerId Layer to encode.
	 * @return The encoded pixels, or null when the layer has none.
	 */
	exportLayer( layerId: string ): Promise< Blob | null > {
		return this.paint.exportLayer( layerId );
	}

	/** Internal state, for diagnosing render problems from the console. */
	debugState(): Record< string, unknown > {
		return rendererDebugState( {
			canvas: this.canvas,
			stack: this.stack,
			layers: this.layers,
			source: this.texture,
			document: this.pixels.texture as GpuTexture | null,
			zoom: this.view.zoom,
			spriteScale: this.sprite ? Math.abs( this.sprite.scale.x ) : null,
			viewport: this.view.viewport(),
			backend: this.gpu.backend,
			precise: this.gpu.hasPreciseTargets,
		} );
	}

	/** Releases everything. */
	destroy(): void {
		if ( this.destroyed ) {
			return;
		}

		this.destroyed = true;

		this.histogram.stop();
		this.view.destroy();
		this.releaseImage();
		this.engine.adjust.release();
		this.layers.releaseMask();
		this.gpu.destroy();
	}
}
