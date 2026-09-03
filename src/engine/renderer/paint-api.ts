/**
 * The painting surface, as the editor sees it.
 *
 * Grouped rather than flattened onto the renderer because these are the methods a
 * *tool* needs and nothing else does. The stroke recorder, the clipboard and the layer
 * importer can each be handed this instead of the whole engine, which is what keeps
 * them testable against a stub.
 */

import type { CanvasSize } from '../../model/document';
import { encodeCanvas } from './encode';
import type { GpuContext, GpuTarget } from './gpu';
import type { LayerTextures } from './layer-textures';
import {
	compositeCanvas,
	dabSprite,
	extractLayerRegion,
	fillWithMask,
	restoreLayerRegion,
} from './paint-ops';
import type { PixelRect } from './paint-ops';
import {
	beginStroke,
	flushStroke,
	releaseStroke,
	stampIntoStroke,
} from './stroke-buffer';
import type { StrokeBuffer } from './stroke-buffer';

/** What the paint API needs from the renderer. */
export interface PaintApiHost {
	gpu: GpuContext;
	layers: LayerTextures;
	/** Current canvas size. */
	canvas: () => CanvasSize;
	/** Called after any change to a layer's pixels. */
	onChange: () => void;
}

/**
 * Everything that writes pixels into a layer.
 */
export class PaintApi {
	private host: PaintApiHost;

	/** The brush stroke in progress, if one is. */
	private stroke: StrokeBuffer | null = null;

	/** Whether a flush of the stroke is already queued for the end of this task. */
	private flushQueued = false;

	/**
	 * @param host Renderer internals the operations run against.
	 */
	constructor( host: PaintApiHost ) {
		this.host = host;
	}

	/** The context every operation runs in. */
	private get ctx() {
		return {
			gpu: this.host.gpu,
			layers: this.host.layers,
			canvas: this.host.canvas(),
		};
	}

	/**
	 * Creates a raster layer's backing texture from an image.
	 *
	 * @param id     Layer id.
	 * @param source Decoded pixels.
	 */
	addRasterTexture( id: string, source: HTMLCanvasElement | HTMLImageElement ): void {
		this.endStroke();
		this.host.layers.addRaster( id, source );
	}

	/**
	 * Creates an empty paintable texture for a layer, canvas-sized.
	 *
	 * @param id Layer id.
	 */
	ensurePaintTexture( id: string ): GpuTarget {
		return this.host.layers.ensurePaintable( id, this.host.canvas() );
	}

	/**
	 * The native size of whatever backs a layer.
	 *
	 * @param id Layer id.
	 */
	layerTextureSize( id: string ): CanvasSize {
		return this.host.layers.sizeOf( id );
	}

	/**
	 * Whether a layer has any pixels at all.
	 *
	 * @param id Layer id.
	 */
	hasTexture( id: string ): boolean {
		return this.host.layers.has( id );
	}

	/**
	 * Sets the mask confining every paint operation.
	 *
	 * @param mask Canvas-sized alpha mask, or null for no confinement.
	 */
	setPaintMask( mask: HTMLCanvasElement | null ): void {
		this.endStroke();
		this.host.layers.setMask( mask );
	}

	/**
	 * Renders a display object into a layer's texture.
	 *
	 * This is how a brush stroke becomes permanent: the stroke is drawn once into the
	 * layer and never re-drawn, so a long painting session costs the same per frame as
	 * an empty one.
	 *
	 * @param id        Layer to paint into.
	 * @param container What to draw.
	 */
	paintInto( id: string, container: unknown ): void {
		this.endStroke();
		this.host.gpu.draw( container, this.ensurePaintTexture( id ) );
		this.host.onChange();
	}

	/**
	 * Stamps one brush dab into a layer.
	 *
	 * The first dab opens a stroke and every dab after it joins the same one, until
	 * `endStroke()` closes it. Within a stroke the opacity applies to the whole stroke:
	 * a dab laid over another does not darken it, and a 20% eraser dragged back and
	 * forth still leaves 80% of what was there -- see `stroke-buffer.ts`.
	 *
	 * @param layerId Target layer.
	 * @param image   Stamp canvas, white with its shape in the alpha.
	 * @param x       Canvas coordinates of the dab centre.
	 * @param y       Canvas coordinates of the dab centre.
	 * @param size    Diameter in canvas pixels.
	 * @param colour  CSS colour.
	 * @param opacity Stroke opacity, 0..1.
	 * @param erase   Whether to remove rather than add.
	 */
	stampBrush(
		layerId: string,
		image: HTMLCanvasElement,
		x: number,
		y: number,
		size: number,
		colour: string,
		opacity: number,
		erase: boolean
	): void {
		const current = this.stroke;

		if (
			current &&
			( current.layerId !== layerId ||
				current.erase !== erase ||
				current.opacity !== opacity )
		) {
			this.endStroke();
		}

		if ( ! this.stroke ) {
			this.stroke = beginStroke(
				this.host.gpu,
				this.host.layers,
				layerId,
				this.host.canvas(),
				opacity,
				erase
			);
		}

		const dab = dabSprite( this.ctx, {
			layerId,
			image,
			x,
			y,
			size,
			colour,
			opacity,
			erase,
		} );

		stampIntoStroke( this.host.gpu, this.host.layers, this.stroke, dab.sprite );
		dab.release();
		this.scheduleFlush();
	}

	/**
	 * Rewrites the layer from the stroke at the end of the current task.
	 *
	 * A pointer event can carry a dozen interpolated dabs, and composing the layer
	 * after each one would cost a dozen full-canvas passes for one visible frame. Once
	 * per task is once per pointer event, which is as often as anything can be seen.
	 */
	private scheduleFlush(): void {
		if ( this.flushQueued ) {
			return;
		}

		this.flushQueued = true;

		queueMicrotask( () => {
			this.flushQueued = false;

			if ( this.stroke ) {
				flushStroke( this.host.gpu, this.stroke );
				this.host.onChange();
			}
		} );
	}

	/**
	 * Closes the stroke in progress, leaving the layer holding its result.
	 *
	 * Safe to call when there is none. Every operation that touches a layer's pixels
	 * some other way calls this first, so a stroke can never be half-applied under a
	 * fill, a paste or an undo.
	 */
	endStroke(): void {
		const stroke = this.stroke;

		if ( ! stroke ) {
			return;
		}

		this.stroke = null;
		flushStroke( this.host.gpu, stroke );
		releaseStroke( stroke );
		this.host.onChange();
	}

	/** Whether a brush stroke is being laid down right now. */
	get isStroking(): boolean {
		return this.stroke !== null;
	}

	/**
	 * Paints a mask into a layer.
	 *
	 * @param layerId Target layer.
	 * @param mask    Mask, opaque where the fill applies.
	 * @param colour  CSS colour.
	 * @param opacity 0..1.
	 * @param x       Where the mask's top-left corner sits, in canvas pixels.
	 * @param y       Where the mask's top-left corner sits, in canvas pixels.
	 */
	fillWithMask(
		layerId: string,
		mask: HTMLCanvasElement,
		colour: string,
		opacity: number,
		x = 0,
		y = 0
	): void {
		this.endStroke();
		fillWithMask( this.ctx, layerId, mask, colour, opacity, x, y );
		this.host.onChange();
	}

	/**
	 * Composites a bitmap onto a layer.
	 *
	 * @param layerId Target layer.
	 * @param source  Bitmap to draw.
	 * @param x       Where its top-left corner lands, in canvas pixels.
	 * @param y       Where its top-left corner lands, in canvas pixels.
	 * @param opacity 0..1.
	 * @param erase   Whether to cut the shape out rather than draw it.
	 */
	compositeCanvas(
		layerId: string,
		source: HTMLCanvasElement,
		x = 0,
		y = 0,
		opacity = 1,
		erase = false
	): void {
		this.endStroke();
		compositeCanvas( this.ctx, layerId, source, x, y, opacity, erase );
		this.host.onChange();
	}

	/**
	 * Reads one rectangle of a layer's pixels.
	 *
	 * During a stroke on that layer the read comes from the snapshot the stroke keeps,
	 * so undo captures the pixels as they were before the brush touched them.
	 *
	 * @param layerId Layer to read.
	 * @param rect    Region, in canvas pixels.
	 */
	extractLayerRegion( layerId: string, rect: PixelRect ): HTMLCanvasElement | null {
		const source =
			this.stroke && this.stroke.layerId === layerId ? this.stroke.base : undefined;

		return extractLayerRegion( this.ctx, layerId, rect, source );
	}

	/**
	 * Reads a whole layer back as a canvas, for saving its pixels.
	 *
	 * @param layerId Layer to read.
	 * @return The pixels, or null when the layer has no texture.
	 */
	extractLayerCanvas( layerId: string ): HTMLCanvasElement | null {
		this.endStroke();

		const gpu = this.host.gpu;
		const texture = this.host.layers.get( layerId );

		if ( ! texture ) {
			return null;
		}

		const resolved = gpu.isTarget( texture )
			? gpu.resolve( texture as GpuTarget )
			: { texture, owned: false };

		try {
			return gpu.extractCanvas( resolved.texture );
		} finally {
			if ( resolved.owned ) {
				resolved.texture.destroy( true );
			}
		}
	}

	/**
	 * Encodes a layer's pixels as a PNG.
	 *
	 * PNG regardless of the document's output format: a layer is mostly transparent,
	 * and its pixels have to come back exactly, not approximately.
	 *
	 * @param layerId Layer to encode.
	 * @return The encoded pixels, or null when the layer has none.
	 */
	async exportLayer( layerId: string ): Promise< Blob | null > {
		const canvas = this.extractLayerCanvas( layerId );

		return canvas ? encodeCanvas( canvas, 'image/png', 1 ) : null;
	}

	/**
	 * Puts one rectangle of a layer back to a previous state.
	 *
	 * @param layerId Layer to write.
	 * @param rect    Region, in canvas pixels.
	 * @param pixels  What to put there, or null to leave it empty.
	 */
	restoreLayerRegion(
		layerId: string,
		rect: PixelRect,
		pixels: HTMLCanvasElement | null
	): void {
		this.endStroke();
		restoreLayerRegion( this.ctx, layerId, rect, pixels );
		this.host.onChange();
	}

	/**
	 * Drops a stroke in progress without writing it.
	 *
	 * For teardown, where the GPU is about to go and drawing into it would be wasted.
	 */
	dispose(): void {
		const stroke = this.stroke;

		this.stroke = null;

		if ( stroke ) {
			releaseStroke( stroke );
		}
	}
}
