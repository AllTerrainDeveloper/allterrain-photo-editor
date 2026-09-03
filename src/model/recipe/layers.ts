/**
 * The document: its canvas, its layer stack, and which layer the tools act on.
 *
 * Geometry lives on the layer, never on the source pixels. That is the whole reason a
 * transform drag is stable -- the surface the pointer is measured against cannot move
 * underneath it -- and the reason a crop can be undone without re-decoding anything.
 */

import {
	findLayer,
	normaliseCanvas,
	normaliseTransform,
	updateLayer,
} from '../document';
import type { CanvasSize, Layer, LayerTransform } from '../document';
import type { Recipe } from './types';

/**
 * Returns a new recipe with the layer transform replaced.
 *
 * @param recipe    Recipe to derive from.
 * @param transform New transform.
 */
export function setLayer( recipe: Recipe, transform: LayerTransform ): Recipe {
	return {
		...recipe,
		layers: updateLayer( recipe.layers, recipe.activeLayerId, {
			transform: normaliseTransform( transform ),
		} ),
	};
}

/**
 * Returns a new recipe with its layer stack replaced.
 *
 * @param recipe Recipe to derive from.
 * @param layers New stack.
 * @param active Optional. Which layer becomes active.
 */
export function setLayers(
	recipe: Recipe,
	layers: Layer[],
	active?: string
): Recipe {
	const stack = layers.length > 0 ? layers : recipe.layers;
	const activeLayerId =
		active && stack.some( ( layer ) => layer.id === active )
			? active
			: stack.some( ( layer ) => layer.id === recipe.activeLayerId )
			? recipe.activeLayerId
			: stack[ stack.length - 1 ].id;

	return { ...recipe, layers: stack, activeLayerId };
}

/** The layer the tools currently act on. */
export function activeLayer( recipe: Recipe ): Layer {
	return findLayer( recipe.layers, recipe.activeLayerId ) ?? recipe.layers[ 0 ];
}

/**
 * Whether the document holds pixels that no recipe can reproduce on its own.
 *
 * Painted and pasted layers are not describable, so an edit containing them is only
 * fully preserved when their pixels travel with the save. Text layers are not counted:
 * they carry the words they were typed as, and can be drawn again from those.
 *
 * @param recipe Recipe to test.
 */
export function hasRasterLayers( recipe: Recipe ): boolean {
	return recipe.layers.some( ( layer ) => layer.kind === 'raster' );
}

/**
 * Returns a new recipe with the canvas and layer replaced together.
 *
 * They change as a pair, because resizing the surface has to move whatever is on it
 * to keep the picture where the user last saw it.
 *
 * @param recipe    Recipe to derive from.
 * @param canvas    New canvas size.
 * @param transform New layer transform.
 */
export function setDocument(
	recipe: Recipe,
	canvas: CanvasSize,
	transform: LayerTransform
): Recipe {
	return {
		...recipe,
		canvas: normaliseCanvas( canvas, recipe.canvas ),
		layers: updateLayer( recipe.layers, recipe.activeLayerId, {
			transform: normaliseTransform( transform ),
		} ),
	};
}
