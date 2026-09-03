/**
 * Letting go of an image.
 *
 * The base layer's texture *is* the loaded source, which is why the two are released
 * together and in this order: the layer store drops its reference first, then the
 * source is destroyed once. Releasing it twice surfaces as a blank canvas with no
 * error, which is a bad afternoon.
 */

import type { Engine } from './assemble';
import type { GpuSprite, GpuTexture } from './gpu';

/**
 * Releases everything tied to the loaded image.
 *
 * @param engine  The engine's collaborators.
 * @param sprite  The on-screen sprite, if there is one.
 * @param texture The loaded source texture, if there is one.
 * @return Null, for the caller to assign back to its sprite field.
 */
export function releaseImage(
	engine: Engine,
	sprite: GpuSprite | null,
	texture: GpuTexture | null
): null {
	engine.paint.dispose();
	engine.compositor.release();
	engine.layers.releaseAll();
	engine.filters.release();

	sprite?.destroy( { children: true } );
	texture?.destroy( true );

	return null;
}
