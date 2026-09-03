/**
 * Everything that becomes a new layer.
 *
 * A dropped photo, a pasted fragment and a line of typed text all arrive the same way:
 * as pixels that need a home. They get a layer of their own rather than being flattened
 * into the document, because an object you can still move, scale, put something behind
 * or throw away is worth more than one you cannot.
 */

import { __ } from '../i18n';
import { createRasterLayer } from '../model/document';
import { toast } from '../platform';
import type { RestClient } from '../net/rest';
import type { RecipeStore } from './recipe-store';
import { resolveDroppedImage } from './image-source';
import type { DroppedImage } from './image-source';
import type { Viewport } from '../ui/panels';

/**
 * How much of the canvas a dropped image fills at most.
 *
 * Short of the full width so the handles stay reachable and it is obvious the layer is
 * an object sitting on the canvas rather than a replacement for it.
 */
const DROP_FIT = 0.8;

/** What layer import needs from the renderer. */
export interface LayerPixels {
	addRasterTexture: ( id: string, source: HTMLCanvasElement | HTMLImageElement ) => void;
	/** The native size of whatever backs a layer; zero when it has no texture. */
	layerTextureSize: ( id: string ) => { width: number; height: number };
}

/** What layer import needs from the editor. */
export interface ImportTarget {
	store: RecipeStore;
	client: RestClient;
	/** Null before the renderer has started. */
	renderer: LayerPixels | null;
	/** The canvas area, for converting a drop position into canvas coordinates. */
	stage: HTMLElement;
	getViewport: () => Viewport | null;
	/** Brush settings, which supply the type styling. */
	getTextStyle: () => {
		size: number;
		family: string;
		colour: string;
		bold: boolean;
		italic: boolean;
		strokeWidth: number;
	};
	/** True once the editor has been torn down, so a late load is dropped. */
	isDestroyed: () => boolean;
	/** Hands the stage to a tool once the layer lands. */
	setActiveTool: ( tool: 'transform' ) => void;
}

/**
 * Adds an image to the document as a new layer.
 *
 * Deliberately not "open this instead". Dropping a photo onto an editor that already
 * holds one means *combine them* -- replacing the document would throw away the work in
 * progress, and there is a separate gesture for opening.
 *
 * The layer arrives scaled to sit inside the canvas. A 6000px photo dropped on a
 * 1200px canvas would otherwise land five times oversized, with its handles somewhere
 * off screen, which reads as the drop having failed.
 *
 * @param target  Editor to add to.
 * @param dropped What was dropped, and where.
 * @return True when a layer was added.
 */
export async function addImageLayer(
	target: ImportTarget,
	dropped: DroppedImage
): Promise< boolean > {
	const renderer = target.renderer;

	if ( ! renderer ) {
		return false;
	}

	let resolved;

	try {
		resolved = await resolveDroppedImage( dropped, target.client );
	} catch ( error ) {
		toast(
			error instanceof Error ? error.message : __( 'That image could not be added.' ),
			'error'
		);

		return false;
	}

	if ( ! resolved ) {
		return false;
	}

	if ( target.isDestroyed() ) {
		resolved.release();

		return false;
	}

	const recipe = target.store.current;
	const canvas = recipe.canvas;
	const { image } = resolved;
	const scale = Math.min(
		1,
		( canvas.width * DROP_FIT ) / Math.max( image.naturalWidth, 1 ),
		( canvas.height * DROP_FIT ) / Math.max( image.naturalHeight, 1 )
	);

	const at = canvasPointFromClient( target, dropped.clientX, dropped.clientY );

	const layer = createRasterLayer( resolved.title || __( 'Image' ), {
		x: at.x,
		y: at.y,
		scaleX: scale,
		scaleY: scale,
	} );

	renderer.addRasterTexture( layer.id, image );
	target.store.setLayers( [ ...recipe.layers, layer ], layer.id );

	// The pixels are in a GPU texture now; the decoded element and any blob URL behind
	// it are not needed and would otherwise be held for the session.
	resolved.release();

	target.setActiveTool( 'transform' );
	toast( __( 'Added as a new layer.' ), 'success' );

	return true;
}

/**
 * Converts a client point into normalised canvas coordinates.
 *
 * Falls back to the centre, which is where an image with no drop position belongs --
 * and where one dropped outside the canvas bounds is most useful.
 *
 * @param target  Editor the point is measured against.
 * @param clientX Client coordinate, if known.
 * @param clientY Client coordinate, if known.
 */
function canvasPointFromClient(
	target: ImportTarget,
	clientX?: number,
	clientY?: number
): { x: number; y: number } {
	const viewport = target.getViewport();

	if (
		! viewport ||
		viewport.width < 1 ||
		clientX === undefined ||
		clientY === undefined
	) {
		return { x: 0.5, y: 0.5 };
	}

	const stage = target.stage.getBoundingClientRect();
	const x = ( clientX - stage.left - viewport.x ) / viewport.width;
	const y = ( clientY - stage.top - viewport.y ) / viewport.height;

	// Clamped, so a release just outside the canvas still lands somewhere visible.
	return {
		x: Math.min( 1, Math.max( 0, x ) ),
		y: Math.min( 1, Math.max( 0, y ) ),
	};
}
