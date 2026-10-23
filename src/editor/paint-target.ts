/**
 * Choosing where a brush stroke lands.
 *
 * Painting onto the base image layer would destroy the original pixels, and the whole
 * plugin rests on not doing that -- so a stroke aimed at it silently gets a new raster
 * layer instead.
 *
 * The eraser cannot take that way out. A new, empty layer has nothing on it to erase,
 * so an eraser aimed at the image used to land there and do nothing at all. It gets a
 * pixel copy of the layer it was aimed at instead -- see `eraseTarget()`.
 */

import { __, sprintf } from '../i18n';
import { createRasterLayer, replaceLayer } from '../model/document';
import type { CanvasSize, Layer, LayerTransform } from '../model/document';
import type { RecipeStore } from './recipe-store';

/** What choosing a target needs from the renderer. */
export interface PaintSurfaces {
	layerTextureSize: ( id: string ) => CanvasSize;
	ensurePaintTexture: ( id: string ) => unknown;
	rasteriseLayer: ( fromId: string, toId: string, transform: LayerTransform ) => boolean;
}

/**
 * The layer a stroke should land on.
 *
 * @param store     Document store.
 * @param renderer  Renderer, or null before it has started.
 * @return Layer id to paint into.
 */
export function paintTarget(
	store: RecipeStore,
	renderer: PaintSurfaces | null
): string {
	const recipe = store.current;
	const active = recipe.layers.find( ( layer ) => layer.id === recipe.activeLayerId );

	if ( active && isPaintSheet( store, renderer, active.id ) ) {
		return active.id;
	}

	const existing = recipe.layers.find(
		( layer ) => 'raster' === layer.kind && isPaintSheet( store, renderer, layer.id )
	);

	if ( existing ) {
		return existing.id;
	}

	const layer = createRasterLayer( __( 'Paint' ) );

	renderer?.ensurePaintTexture( layer.id );

	// Not an undo step of its own. The layer exists because a stroke needed somewhere
	// to go, so folding it into the current entry keeps one stroke to one undo --
	// otherwise the first press would remove a stroke's *container* and appear to do
	// nothing at all.
	store.setLayers( [ ...recipe.layers, layer ], layer.id, false );

	return layer.id;
}

/**
 * The layer an eraser stroke should land on.
 *
 * A sheet is erased in place. Anything else is first copied onto one, so the eraser
 * has the pixels the user is looking at to take away:
 *
 * - The **image** layer is kept, hidden, underneath its copy. The photograph is never
 *   written to, so the erase is still non-destructive -- showing the original layer
 *   again brings everything back, and the history brush still paints from it.
 * - A **text** or **pasted** layer is replaced by its copy. They are objects sized to
 *   their content, and erasing part of one is what turns it into plain pixels; the
 *   original stays one undo away.
 *
 * The copy is an undo step of its own, so undoing an erase puts the pixels back first
 * and only then the layer the eraser was aimed at.
 *
 * Erasing the photograph is the one edit that leaves the saved copy with holes in it,
 * and a JPEG has nowhere to keep them, so the output switches to PNG when it was JPEG.
 *
 * @param store    Document store.
 * @param renderer Renderer, or null before it has started.
 * @return Layer id to erase from.
 */
export function eraseTarget(
	store: RecipeStore,
	renderer: PaintSurfaces | null
): string {
	const recipe = store.current;
	const active = recipe.layers.find( ( layer ) => layer.id === recipe.activeLayerId );

	if ( ! active || ! renderer || isPaintSheet( store, renderer, active.id ) ) {
		return paintTarget( store, renderer );
	}

	const isImage = 'image' === active.kind;
	const name = isImage
		? sprintf(
				/* translators: %s: name of the image layer being erased. */
				__( '%s (erased)' ),
				active.name
		  )
		: active.name;
	const sheet: Layer = {
		...createRasterLayer( name ),
		visible: active.visible,
		opacity: active.opacity,
	};

	if ( ! renderer.rasteriseLayer( active.id, sheet.id, active.transform ) ) {
		return paintTarget( store, renderer );
	}

	const layers = isImage
		? recipe.layers.flatMap( ( layer ) =>
				layer.id === active.id ? [ { ...layer, visible: false }, sheet ] : [ layer ]
		  )
		: replaceLayer( recipe.layers, active.id, sheet );

	store.setLayers( layers, sheet.id, true, 'rasterise' );

	if ( isImage && 'image/jpeg' === recipe.output.format ) {
		store.setOutput( { format: 'image/png' } );
	}

	return sheet.id;
}

/**
 * Whether a layer is a full-canvas sheet that can be painted on directly.
 *
 * Text and pasted layers are *objects*: their texture is the size of their content
 * and their transform puts it somewhere. Painting into one would promote it to a
 * canvas-sized target with the old content re-centred, so the object would jump
 * across the canvas the moment a brush touched it. Strokes therefore go to a sheet,
 * and the objects stay where they were put.
 *
 * @param store    Document store.
 * @param renderer Renderer, or null before it has started.
 * @param layerId  Layer to test.
 */
function isPaintSheet(
	store: RecipeStore,
	renderer: PaintSurfaces | null,
	layerId: string
): boolean {
	const recipe = store.current;
	const layer = recipe.layers.find( ( entry ) => entry.id === layerId );

	if ( ! layer || 'raster' !== layer.kind || ! renderer ) {
		return false;
	}

	const size = renderer.layerTextureSize( layerId );

	// A sheet with no texture yet is one that has just been created for this stroke.
	return (
		0 === size.width ||
		( size.width === recipe.canvas.width && size.height === recipe.canvas.height )
	);
}
