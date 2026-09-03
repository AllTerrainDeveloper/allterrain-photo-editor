/**
 * Drawing the layer stack onto the canvas.
 *
 * Everything downstream -- the on-screen sprite, the histogram probe, the save --
 * reads this one texture, so the adjustment pipeline never has to know how any layer
 * was positioned.
 *
 * Critically, the composition depends only on the canvas size, never on the viewport.
 * That is what lets a transform handle be dragged without the surface moving under the
 * drag.
 */

import { BASE_LAYER_ID } from '../../model/document';
import type { CanvasSize, Layer, LayerTransform } from '../../model/document';
import type { GpuContext, GpuSprite, GpuTarget, GpuTexture, PixelReadback } from './gpu';
import type { LayerTextures } from './layer-textures';

/**
 * Positions a sprite the way a layer's transform describes.
 *
 * @param sprite    Sprite to place.
 * @param transform Layer transform.
 * @param canvas    Canvas the transform is expressed against.
 */
function placeLayer(
	sprite: GpuSprite,
	transform: LayerTransform,
	canvas: CanvasSize
): void {
	const { x, y, scaleX, scaleY, rotation, flipH, flipV } = transform;

	sprite.anchor.set( 0.5 );
	sprite.scale.set( scaleX * ( flipH ? -1 : 1 ), scaleY * ( flipV ? -1 : 1 ) );
	sprite.rotation = ( rotation * Math.PI ) / 180;
	sprite.position.set( x * canvas.width, y * canvas.height );
}

/**
 * The composed document.
 */
export class DocumentCompositor {
	private gpu: GpuContext;

	private layers: LayerTextures;

	/**
	 * The layer stack drawn onto the canvas.
	 *
	 * Always present once an image is loaded, because the canvas is what gets saved
	 * and it is no longer guaranteed to be the same shape as the source.
	 */
	private target: GpuTarget | null = null;

	/**
	 * @param gpu    Drawing context.
	 * @param layers Layer textures.
	 */
	constructor( gpu: GpuContext, layers: LayerTextures ) {
		this.gpu = gpu;
		this.layers = layers;
	}

	/** The composed texture, or null before anything has been composed. */
	get texture(): GpuTarget | null {
		return this.target;
	}

	/**
	 * Redraws the layer stack onto the canvas.
	 *
	 * @param canvas Output surface size.
	 * @param stack  Layers, back to front.
	 * @param source The loaded image, which backs the base layer.
	 * @param hidden Optional. A layer to leave out without changing the document --
	 *               the text layer whose words are being retyped on top of it.
	 */
	compose(
		canvas: CanvasSize,
		stack: Layer[],
		source: GpuTexture | null,
		hidden: string | null = null
	): void {
		this.release();

		if ( ! source || canvas.width <= 0 || canvas.height <= 0 ) {
			return;
		}

		// The base image layer's texture is the loaded source.
		if ( ! this.layers.has( BASE_LAYER_ID ) ) {
			this.layers.set( BASE_LAYER_ID, source );
		}

		// Half-float where the GPU allows it. This is the one texture in the pipeline
		// that is written and then *sampled again* -- every layer is blended into it and
		// the adjustment shader reads it -- so it is where eight bits per channel
		// actually costs something: a stack of semi-transparent layers quantises once
		// per layer, and the geometry pass quantises before the colour maths has run at
		// all. Everything downstream of the adjustments is eight bits either way,
		// because that is what a PNG holds.
		const target = this.gpu.createTarget( canvas.width, canvas.height, true );
		const holder = this.gpu.container();

		for ( const layer of stack ) {
			const texture = this.layers.get( layer.id );

			if (
				! texture ||
				! layer.visible ||
				layer.opacity <= 0 ||
				layer.id === hidden
			) {
				continue;
			}

			const sprite = this.gpu.sprite( texture );

			placeLayer( sprite, layer.transform, canvas );
			sprite.alpha = layer.opacity;
			holder.addChild( sprite );
		}

		this.gpu.draw( holder, target, true );
		holder.destroy( { children: true } );

		this.target = target;
	}

	/**
	 * Reads the composed document as raw bytes, for flood fill.
	 *
	 * Through a resolve, because the composed texture is half-float where the GPU
	 * allows it and half-float samples read back as bytes are not the numbers anyone
	 * wanted. The blit costs one full-canvas draw and only happens when something asks
	 * for pixels -- the eyedropper, the wand, the paint bucket -- never per frame.
	 */
	readPixels(): PixelReadback | null {
		if ( ! this.target ) {
			return null;
		}

		const resolved = this.gpu.resolve( this.target );

		try {
			return this.gpu.extractPixels( resolved.texture );
		} finally {
			if ( resolved.owned ) {
				resolved.texture.destroy( true );
			}
		}
	}

	/**
	 * Reads one composed pixel.
	 *
	 * @param x Canvas coordinate.
	 * @param y Canvas coordinate.
	 * @return Channels 0..255, or null when there is nothing there.
	 */
	samplePixel( x: number, y: number ): [ number, number, number, number ] | null {
		const read = this.readPixels();

		if ( ! read ) {
			return null;
		}

		const px = Math.round( x );
		const py = Math.round( y );

		if ( px < 0 || py < 0 || px >= read.width || py >= read.height ) {
			return null;
		}

		const index = ( py * read.width + px ) * 4;

		return [
			read.pixels[ index ],
			read.pixels[ index + 1 ],
			read.pixels[ index + 2 ],
			read.pixels[ index + 3 ],
		];
	}

	/**
	 * Reads the image alone, with every painted layer left out.
	 *
	 * What the history brush paints from. Composed on demand rather than snapshotted at
	 * load, because holding a second full-resolution copy of a twenty-megapixel photo
	 * for the whole session -- against the chance that one brush gets used -- is the
	 * kind of cost that only shows up on someone else's machine.
	 *
	 * @param canvas Output surface size.
	 * @param stack  Layers, back to front.
	 * @param source The loaded image.
	 * @return Canvas-aligned pixels, or null when nothing is loaded.
	 */
	readPristine(
		canvas: CanvasSize,
		stack: Layer[],
		source: GpuTexture | null
	): PixelReadback | null {
		const base = this.layers.get( BASE_LAYER_ID ) ?? source;
		const layer = stack.find( ( entry ) => BASE_LAYER_ID === entry.id );

		if ( ! base || ! layer || canvas.width <= 0 || canvas.height <= 0 ) {
			return null;
		}

		const target = this.gpu.createTarget( canvas.width, canvas.height );
		const sprite = this.gpu.sprite( base );

		placeLayer( sprite, layer.transform, canvas );

		this.gpu.draw( sprite, target, true );

		const read = this.gpu.extractPixels( target );

		sprite.destroy();
		target.destroy( true );

		return { pixels: read.pixels, width: canvas.width, height: canvas.height };
	}

	/**
	 * Reads part of the composed document back as pixels, for copy.
	 *
	 * @param x      Left edge, in canvas pixels.
	 * @param y      Top edge, in canvas pixels.
	 * @param width  Region width.
	 * @param height Region height.
	 */
	extractRegion(
		x: number,
		y: number,
		width: number,
		height: number
	): HTMLCanvasElement | null {
		if ( ! this.target || width < 1 || height < 1 ) {
			return null;
		}

		const resolved = this.gpu.resolve( this.target );
		const full = this.gpu.extractCanvas( resolved.texture );

		if ( resolved.owned ) {
			resolved.texture.destroy( true );
		}

		const out = document.createElement( 'canvas' );

		out.width = Math.round( width );
		out.height = Math.round( height );

		const context = out.getContext( '2d' );

		if ( ! context ) {
			return null;
		}

		context.drawImage(
			full,
			Math.round( x ),
			Math.round( y ),
			out.width,
			out.height,
			0,
			0,
			out.width,
			out.height
		);

		return out;
	}

	/** Frees the composed texture. */
	release(): void {
		this.target?.destroy( true );
		this.target = null;
	}
}
