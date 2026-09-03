/**
 * Text as a layer.
 *
 * Not painted into the shared raster layer. Text is an object: you want to move it,
 * scale it, put something behind it or throw it away without touching anything else --
 * and none of that is possible once it has been flattened into a canvas-sized sheet
 * along with every brush stroke. So each commit becomes a layer whose texture is
 * exactly the size of the glyphs, positioned where they were typed.
 *
 * The layer also keeps the words and the style they were set in. The texture is only
 * a rendering of those, which is what lets the text be opened and retyped later, and
 * what lets a saved edit draw it again from the recipe alone.
 *
 * This is the same path a paste takes, for the same reason.
 */

import { textCanvas } from '../engine/paint-shapes';
import {
	createTextLayer,
	findLayer,
	layerBounds,
	replaceLayer,
} from '../model/document';
import type { CanvasSize, Layer, TextSource } from '../model/document';
import type { Recipe } from '../model/recipe';
import type { Point } from '../model/selection';
import { textLayerName } from './image-source';
import type { ImportTarget, LayerPixels } from './layer-import';

/** Where a text layer's caret goes, and how big it is drawn. */
export interface TextPlacement {
	/** Canvas coordinates of the first line's top-left corner. */
	point: Point;
	/** The layer's transform scale. */
	scale: { x: number; y: number };
}

/** A rendering of a text source. */
type Rendered = NonNullable< ReturnType< typeof textCanvas > >;

/**
 * Draws a text source into a bitmap.
 *
 * @param source What to draw.
 */
function render( source: TextSource ): Rendered | null {
	return textCanvas( {
		text: source.text,
		size: source.size,
		family: source.family,
		colour: source.colour,
		bold: source.bold,
		italic: source.italic,
		strokeWidth: source.strokeWidth,
	} );
}

/**
 * The style the brush is set to, as a text source.
 *
 * @param target Editor to read from.
 * @param text   The words.
 */
function sourceFromBrush( target: ImportTarget, text: string ): TextSource {
	const style = target.getTextStyle();

	return {
		text,
		size: style.size,
		family: style.family,
		colour: style.colour,
		bold: style.bold,
		italic: style.italic,
		strokeWidth: style.strokeWidth,
	};
}

/**
 * Where a layer's centre goes for its glyphs to start at a point.
 *
 * A layer is positioned by its centre, and text is placed by the top-left corner of
 * its first line -- so the bitmap's own size, and the padding it carries around the
 * glyphs, close the gap. The layer's scale rides along because the bitmap is scaled
 * about that centre.
 *
 * @param point    Canvas coordinates of the first line's top-left corner.
 * @param rendered The bitmap.
 * @param scale    The layer's transform scale.
 * @param canvas   Canvas size, to normalise the result.
 */
function centreFor(
	point: Point,
	rendered: Rendered,
	scale: { x: number; y: number },
	canvas: CanvasSize
): { x: number; y: number } {
	return {
		x:
			( point.x +
				rendered.offsetX * scale.x +
				( rendered.canvas.width * scale.x ) / 2 ) /
			canvas.width,
		y:
			( point.y +
				rendered.offsetY * scale.y +
				( rendered.canvas.height * scale.y ) / 2 ) /
			canvas.height,
	};
}

/**
 * Where a text layer's first line begins, in canvas pixels.
 *
 * The inverse of `centreFor()`: the bitmap is drawn again, so its size is known, and
 * the top-left of the glyphs follows from the layer's centre and scale. Drawing again
 * rather than remembering is what keeps a moved or scaled layer honest -- the caret
 * lands where the glyphs are now, not where they were typed.
 *
 * @param layer  A text layer.
 * @param canvas Canvas size.
 * @return The placement, or null for a layer that is not text.
 */
export function textPlacement( layer: Layer, canvas: CanvasSize ): TextPlacement | null {
	if ( ! layer.text ) {
		return null;
	}

	const rendered = render( layer.text );

	if ( ! rendered || canvas.width < 1 ) {
		return null;
	}

	const scale = { x: layer.transform.scaleX, y: layer.transform.scaleY };

	return {
		point: {
			x:
				layer.transform.x * canvas.width -
				( rendered.canvas.width * scale.x ) / 2 -
				rendered.offsetX * scale.x,
			y:
				layer.transform.y * canvas.height -
				( rendered.canvas.height * scale.y ) / 2 -
				rendered.offsetY * scale.y,
		},
		scale,
	};
}

/**
 * Turns typed text into a layer of its own.
 *
 * @param target Editor to add to.
 * @param text   What was typed.
 * @param point  Canvas coordinates of the first line's top-left corner.
 * @return True when a layer was added.
 */
export function drawTextLayer(
	target: ImportTarget,
	text: string,
	point: Point
): boolean {
	const renderer = target.renderer;
	const source = sourceFromBrush( target, text );
	const rendered = render( source );

	if ( ! renderer || ! rendered ) {
		return false;
	}

	const recipe = target.store.current;
	const canvas: CanvasSize = recipe.canvas;

	if ( canvas.width < 1 || canvas.height < 1 ) {
		return false;
	}

	const layer = createTextLayer(
		textLayerName( text ),
		source,
		centreFor( point, rendered, { x: 1, y: 1 }, canvas )
	);

	renderer.addRasterTexture( layer.id, rendered.canvas );
	target.store.setLayers( [ ...recipe.layers, layer ], layer.id );

	return true;
}

/**
 * Replaces a text layer's words.
 *
 * The layer comes back under a new id rather than being rewritten in place. Its
 * texture is a rendering of the words, and undo has to be able to show the old
 * words again -- which it can only do while the old texture is still reachable from
 * a state on the stack. A new id is what keeps it there.
 *
 * Everything else about the layer survives: its position, its scale and rotation,
 * whether it is visible, how opaque it is. Emptying the text removes the layer, which
 * is what deleting every word means.
 *
 * @param target  Editor to change.
 * @param layerId Text layer to retype.
 * @param text    The new words.
 * @param point   Canvas coordinates of the first line's top-left corner.
 * @return True when the document changed.
 */
export function replaceTextLayer(
	target: ImportTarget,
	layerId: string,
	text: string,
	point: Point
): boolean {
	const recipe = target.store.current;
	const existing = findLayer( recipe.layers, layerId );

	if ( ! existing || ! existing.text ) {
		return false;
	}

	if ( ! text.trim() ) {
		target.store.setLayers(
			recipe.layers.filter( ( layer ) => layer.id !== layerId ),
			undefined,
			true,
			'text'
		);

		return true;
	}

	const renderer = target.renderer;
	const source = sourceFromBrush( target, text );
	const rendered = render( source );
	const canvas = recipe.canvas;

	if ( ! renderer || ! rendered || canvas.width < 1 || canvas.height < 1 ) {
		return false;
	}

	const scale = { x: existing.transform.scaleX, y: existing.transform.scaleY };
	const layer: Layer = {
		...createTextLayer( textLayerName( text ), source, {
			...existing.transform,
			...centreFor( point, rendered, scale, canvas ),
		} ),
		visible: existing.visible,
		opacity: existing.opacity,
	};

	renderer.addRasterTexture( layer.id, rendered.canvas );
	// Its own history label: selecting the layer to edit it was a `layers` change a
	// moment ago, and the retype must not fold into that entry.
	target.store.setLayers(
		replaceLayer( recipe.layers, layerId, layer ),
		layer.id,
		true,
		'text'
	);

	return true;
}

/**
 * Draws a text layer's words into its texture.
 *
 * What re-opening a saved edit does for every text layer in it: the pixels were never
 * stored, because the words were, and the words are enough.
 *
 * @param renderer Where textures live.
 * @param layer    A text layer.
 * @return True when a texture was made.
 */
export function rasteriseTextLayer( renderer: LayerPixels, layer: Layer ): boolean {
	if ( ! layer.text ) {
		return false;
	}

	const rendered = render( layer.text );

	if ( ! rendered ) {
		return false;
	}

	renderer.addRasterTexture( layer.id, rendered.canvas );

	return true;
}

/**
 * The text layer under a point, if there is one.
 *
 * Front-most first, and only layers that can be seen: clicking on text you have hidden
 * should start new text, not reopen the invisible.
 *
 * @param recipe   The document.
 * @param renderer Where textures live, for each layer's native size.
 * @param point    Canvas coordinates.
 * @return The layer hit, or null.
 */
export function hitTextLayer(
	recipe: Recipe,
	renderer: Pick< LayerPixels, 'layerTextureSize' >,
	point: Point
): Layer | null {
	const canvas = recipe.canvas;

	for ( let index = recipe.layers.length - 1; index >= 0; index-- ) {
		const layer = recipe.layers[ index ];

		if ( 'text' !== layer.kind || ! layer.visible ) {
			continue;
		}

		const size = renderer.layerTextureSize( layer.id );

		if ( size.width < 1 ) {
			continue;
		}

		const bounds = layerBounds( size, layer.transform, canvas );

		if (
			point.x >= bounds.x &&
			point.x <= bounds.x + bounds.width &&
			point.y >= bounds.y &&
			point.y <= bounds.y + bounds.height
		) {
			return layer;
		}
	}

	return null;
}
