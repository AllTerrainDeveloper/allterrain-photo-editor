/**
 * The Pixi application, behind a surface this plugin actually uses.
 *
 * Every other module in this package draws through here rather than reaching for
 * `app.renderer` itself. That is worth the indirection twice over: it keeps the narrow
 * Pixi surface the engine is typed against in one file, and it is the only place the
 * two easy-to-get-wrong rules live -- that a render root never gets its blend mode
 * applied, and that a render texture has to be destroyed with its source.
 */

import { loadPixi } from '../pixi-loader';
import type { Pixi } from '../pixi-loader';
import type { RendererBackend } from '../../types';

/** A Pixi texture, in the narrow form this engine uses. */
export type GpuTexture = InstanceType< Pixi[ 'Texture' ] >;

/** A Pixi render target. */
export type GpuTarget = InstanceType< Pixi[ 'RenderTexture' ] >;

/** A Pixi sprite. */
export type GpuSprite = InstanceType< Pixi[ 'Sprite' ] >;

/** A Pixi container. */
export type GpuContainer = InstanceType< Pixi[ 'Container' ] >;

/** Raw pixels read back off the GPU. */
export interface PixelReadback {
	pixels: Uint8ClampedArray;
	width: number;
	height: number;
}

/**
 * Owns the Pixi application and the drawing primitives built on it.
 */
export class GpuContext {
	readonly pixi: Pixi;

	readonly app: InstanceType< Pixi[ 'Application' ] >;

	/** One white pixel, stretched into an eraser stencil when a region is restored. */
	private solid: GpuTexture | null = null;

	/** Whether half-float render targets work here. Null until first asked. */
	private precision: boolean | null = null;

	/**
	 * @param pixi The Pixi namespace.
	 * @param app  An initialised application.
	 */
	private constructor( pixi: Pixi, app: InstanceType< Pixi[ 'Application' ] > ) {
		this.pixi = pixi;
		this.app = app;
	}

	/**
	 * Boots Pixi and attaches a canvas to a host element.
	 *
	 * The backend used to be pinned to WebGL, for a good reason: the adjustment filter
	 * shipped a GLSL program only, and Pixi silently *skips* a filter that has no
	 * program for the active backend, which shows the unedited image with no error at
	 * all. It now ships a WGSL program too, so the pin is a preference rather than a
	 * requirement -- but the default is still WebGL, because that is the path with
	 * years of use behind it and `auto` is a choice a site should make deliberately.
	 *
	 * `auto` asks Pixi for WebGPU and lets it fall back to WebGL by itself on a
	 * browser that has none.
	 *
	 * @param host       Element the canvas fills.
	 * @param preference Which backend to ask for.
	 */
	static async create(
		host: HTMLElement,
		preference: RendererBackend = 'webgl'
	): Promise< GpuContext > {
		const pixi = await loadPixi();
		const app = new pixi.Application();

		await app.init( {
			preference: 'auto' === preference ? 'webgpu' : preference,
			backgroundAlpha: 0,
			antialias: false,
			autoDensity: true,
			resolution: window.devicePixelRatio || 1,
		} );

		app.canvas.classList.add( 'lz-canvas' );
		host.appendChild( app.canvas as unknown as Node );

		return new GpuContext( pixi, app );
	}

	/**
	 * Which backend Pixi actually chose.
	 *
	 * Worth asking rather than assuming once `auto` is a supported preference: WebGPU
	 * falls back to WebGL by itself, silently and correctly, and the only way to know
	 * which one is running is to look.
	 */
	get backend(): string {
		return ( this.app.renderer as unknown as { gl?: unknown } ).gl
			? 'webgl'
			: 'webgpu';
	}

	/** Whether intermediate render targets are half-float here. */
	get hasPreciseTargets(): boolean {
		return this.halfFloat;
	}

	/** The drawing surface, in CSS pixels. */
	get screen(): { width: number; height: number } {
		return this.app.renderer.screen;
	}

	/** The root container everything on screen hangs off. */
	get stage(): GpuContainer {
		return this.app.stage;
	}

	/**
	 * Matches the drawing surface to a size.
	 *
	 * @param width  Width in CSS pixels.
	 * @param height Height in CSS pixels.
	 * @return Whether the surface actually changed, which means it was also cleared.
	 */
	resize( width: number, height: number ): boolean {
		const screen = this.app.renderer.screen;

		if ( screen.width === width && screen.height === height ) {
			return false;
		}

		this.app.renderer.resize( width, height );

		return true;
	}

	/**
	 * Draws the stage now, instead of waiting for the ticker's next frame.
	 *
	 * Resizing reallocates the drawing buffer, and a reallocated buffer is transparent
	 * until something is drawn into it. That is normally invisible -- but a
	 * ResizeObserver callback runs *after* the frame's animation callbacks, so the
	 * ticker has already drawn this frame by the time the surface is replaced, and the
	 * browser paints the empty one. One blank frame per resize step, which during a
	 * window drag is every frame: the picture flickers, or seems to vanish and come
	 * back.
	 *
	 * Drawing here closes that gap. The ResizeObserver still runs before paint, so the
	 * frame the user sees has the picture in it at the new size.
	 */
	renderNow(): void {
		this.app.render();
	}

	/**
	 * Creates a render target.
	 *
	 * @param width   Width in pixels.
	 * @param height  Height in pixels.
	 * @param precise Whether to ask for sixteen bits per channel. Only worth it for a
	 *                texture that is *sampled again* rather than read back or encoded:
	 *                the extra precision is spent on the next pass, and the last pass
	 *                is eight bits either way.
	 */
	createTarget( width: number, height: number, precise = false ): GpuTarget {
		return this.pixi.RenderTexture.create( {
			width: Math.max( 1, Math.round( width ) ),
			height: Math.max( 1, Math.round( height ) ),
			...( precise && this.halfFloat ? { format: 'rgba16float' as const } : {} ),
		} );
	}

	/**
	 * Whether half-float render targets are usable.
	 *
	 * WebGL2 can *sample* a half-float texture always but can only *render into* one
	 * with `EXT_color_buffer_half_float` (or `EXT_color_buffer_float`, which implies
	 * it), and without the extension the framebuffer is merely incomplete -- no
	 * exception, nothing drawn. Asking the context is the only honest way to know.
	 */
	private get halfFloat(): boolean {
		if ( this.precision === null ) {
			this.precision = this.detectHalfFloat();
		}

		return this.precision;
	}

	/** Works out whether this renderer can draw into a half-float texture. */
	private detectHalfFloat(): boolean {
		try {
			const renderer = this.app.renderer as unknown as {
				type?: number;
				gl?: WebGL2RenderingContext;
			};

			// A WebGPU renderer has no `gl`. Every WebGPU *device* supports rgba16float
			// as a render target, and Pixi 8 does not: its pipeline cache is not keyed
			// on the target's colour format, so the batcher's pipeline -- compiled for
			// the BGRA8 canvas -- is reused for a pass into an RGBA16F texture and the
			// device rejects the whole command buffer. Nothing renders, and it says so
			// only as a console warning. Eight bits on WebGPU is a real cost; a blank
			// canvas is not a trade.
			if ( ! renderer.gl ) {
				return false;
			}

			return (
				!! renderer.gl.getExtension( 'EXT_color_buffer_half_float' ) ||
				!! renderer.gl.getExtension( 'EXT_color_buffer_float' )
			);
		} catch {
			return false;
		}
	}

	/**
	 * An eight-bit copy of a target, for anything that reads pixels back.
	 *
	 * A half-float texture cannot be read with `readPixels` as bytes -- the values come
	 * back reinterpreted, which shows up as an eyedropper picking nonsense. One blit
	 * resolves it, and only when someone actually asks for pixels rather than on every
	 * frame. An eight-bit target is returned as it stands, with `owned` false, so the
	 * caller knows not to free something it did not create.
	 *
	 * @param target Texture to resolve.
	 */
	resolve( target: GpuTarget ): { texture: GpuTarget; owned: boolean } {
		if ( ! this.isHalfFloat( target ) ) {
			return { texture: target, owned: false };
		}

		const copy = this.pixi.RenderTexture.create( {
			width: target.width,
			height: target.height,
		} );
		const sprite = this.sprite( target );

		this.draw( sprite, copy, true );
		sprite.destroy();

		return { texture: copy, owned: true };
	}

	/**
	 * Whether a texture holds half-float samples.
	 *
	 * @param texture Texture to test.
	 */
	private isHalfFloat( texture: GpuTexture ): boolean {
		return (
			( texture.source as unknown as { format?: string } ).format === 'rgba16float'
		);
	}

	/**
	 * Wraps a source in a texture.
	 *
	 * @param source Decoded pixels.
	 */
	textureFrom( source: HTMLCanvasElement | HTMLImageElement ): GpuTexture {
		return this.pixi.Texture.from( source );
	}

	/** An empty container. */
	container(): GpuContainer {
		return new this.pixi.Container();
	}

	/**
	 * A sprite over a texture.
	 *
	 * @param texture What to draw.
	 */
	sprite( texture: GpuTexture ): GpuSprite {
		return new this.pixi.Sprite( texture );
	}

	/**
	 * Draws a container into a target.
	 *
	 * @param container What to draw.
	 * @param target    Where to draw it. Omit for the screen.
	 * @param clear     Whether to wipe the target first.
	 */
	draw( container: unknown, target: GpuTarget, clear = false ): void {
		this.app.renderer.render( { container: container as never, target, clear } );
	}

	/**
	 * Draws one sprite into a target, honouring its blend mode.
	 *
	 * The wrapping container is not ceremony. A sprite passed as the render *root* is
	 * its own render group, and the batcher never applies a root's blend mode -- so an
	 * `erase` sprite rendered directly paints solid white instead of clearing, with no
	 * error.
	 *
	 * @param sprite What to draw. Destroyed afterwards.
	 * @param target Texture to draw into.
	 * @param clear  Whether to wipe the target first.
	 */
	drawDetached( sprite: GpuSprite, target: GpuTarget, clear = false ): void {
		const holder = this.container();

		holder.addChild( sprite );
		this.draw( holder, target, clear );
		holder.destroy( { children: true } );
	}

	/**
	 * Reads a texture back as a canvas.
	 *
	 * Any texture, not only a render target: a pasted layer's pixels sit in a plain
	 * texture, and saving them beside the recipe has to read those too.
	 *
	 * @param texture Texture to read.
	 */
	extractCanvas( texture: GpuTexture ): HTMLCanvasElement {
		return this.app.renderer.extract.canvas( texture ) as HTMLCanvasElement;
	}

	/**
	 * Reads a target back as raw bytes.
	 *
	 * @param target Texture to read.
	 */
	extractPixels( target: GpuTarget ): PixelReadback {
		const { pixels } = this.app.renderer.extract.pixels( target );

		return { pixels, width: target.width, height: target.height };
	}

	/**
	 * A one-pixel opaque white texture, used as an eraser stencil.
	 *
	 * Built here rather than taken from `Texture.WHITE` so the narrow Pixi surface this
	 * engine is typed against stays narrow.
	 */
	solidTexture(): GpuTexture {
		if ( ! this.solid ) {
			const canvas = document.createElement( 'canvas' );

			canvas.width = 1;
			canvas.height = 1;

			const ctx = canvas.getContext( '2d' );

			if ( ctx ) {
				ctx.fillStyle = '#fff';
				ctx.fillRect( 0, 0, 1, 1 );
			}

			this.solid = this.textureFrom( canvas );
		}

		return this.solid;
	}

	/**
	 * Whether a texture can be rendered into.
	 *
	 * @param texture Texture to test.
	 */
	isTarget( texture: GpuTexture ): boolean {
		return texture instanceof this.pixi.RenderTexture;
	}

	/**
	 * Releases the application.
	 *
	 * `destroy( true )` on the Application is deliberately *not* used: it releases
	 * Pixi's global resource registries, which corrupts any other Pixi application
	 * alive on the page. OpenStation runs its own -- wallpapers, widgets, games --
	 * so taking that shortcut here would break unrelated windows.
	 */
	destroy(): void {
		this.solid = null;
		this.app.destroy( { removeView: true }, { children: true, texture: true } );
	}
}
