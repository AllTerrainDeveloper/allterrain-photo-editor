/**
 * The layer stack.
 *
 * Three kinds, and the difference matters everywhere: an `image` layer draws the
 * opened photograph, a `raster` layer draws pixels that exist only in a GPU texture,
 * and a `text` layer draws words it still remembers. The second kind is why saving a
 * painted edit has to carry the pixels along, and why undo has to keep textures alive
 * for states it is no longer showing. The third is why a line of text can be opened
 * again after it has been rasterised: the texture is a rendering of the source, and
 * the source is what the layer keeps.
 */

import { IDENTITY_TRANSFORM, normaliseTransform } from './transform';
import type { LayerTransform } from './transform';

/**
 * What a layer is made of.
 *
 * `image` layers are backed by an attachment's texture and are purely descriptive:
 * the recipe can reproduce them from the original file. `raster` layers hold pixels
 * that exist nowhere else -- a pasted fragment, a brush stroke -- and therefore
 * cannot be reconstructed from a recipe alone. `text` layers hold a rendering of
 * words they still carry, so the recipe can draw them again. See `Layer` for what
 * that costs.
 */
export type LayerKind = 'image' | 'raster' | 'text';

/**
 * What a text layer was typed as.
 *
 * Everything `textCanvas()` needs to draw the same glyphs again: the words, and the
 * style they were set in. Kept on the layer rather than baked into its pixels, which
 * is what makes text editable after the fact and reproducible after a save.
 */
export interface TextSource {
	text: string;
	/** Em size in canvas pixels. */
	size: number;
	family: string;
	colour: string;
	bold: boolean;
	italic: boolean;
	/** Outline width in canvas pixels; 0 for solid text. */
	strokeWidth: number;
}

/** One layer in the document stack. */
export interface Layer {
	id: string;
	name: string;
	kind: LayerKind;
	transform: LayerTransform;
	visible: boolean;
	/** 0..1. */
	opacity: number;
	/** What a `text` layer says. Absent on every other kind. */
	text?: TextSource;
}

/** The base layer every document starts with, holding the opened image. */
export const BASE_LAYER_ID = 'base';

/** Longest text a single layer may hold. Generous; a caption is a few dozen characters. */
export const MAX_TEXT_LENGTH = 5000;

/**
 * Builds the layer an opened image becomes.
 *
 * @param name Display name.
 */
export function createImageLayer( name: string ): Layer {
	return {
		id: BASE_LAYER_ID,
		name,
		kind: 'image',
		transform: { ...IDENTITY_TRANSFORM },
		visible: true,
		opacity: 1,
	};
}

/**
 * A fresh layer id.
 *
 * Letters, digits and a dash only, because the id doubles as the filename a saved
 * layer's pixels are stored under.
 */
export function newLayerId(): string {
	return `layer-${ Math.random().toString( 36 ).slice( 2, 10 ) }`;
}

/**
 * Builds an empty raster layer.
 *
 * @param name      Display name.
 * @param transform Optional starting transform.
 */
export function createRasterLayer(
	name: string,
	transform: Partial< LayerTransform > = {}
): Layer {
	return {
		id: newLayerId(),
		name,
		kind: 'raster',
		transform: { ...IDENTITY_TRANSFORM, ...transform },
		visible: true,
		opacity: 1,
	};
}

/**
 * Builds a text layer.
 *
 * @param name      Display name.
 * @param source    What it says, and how.
 * @param transform Optional starting transform.
 */
export function createTextLayer(
	name: string,
	source: TextSource,
	transform: Partial< LayerTransform > = {}
): Layer {
	return {
		id: newLayerId(),
		name,
		kind: 'text',
		transform: { ...IDENTITY_TRANSFORM, ...transform },
		visible: true,
		opacity: 1,
		text: normaliseTextSource( source ) ?? source,
	};
}

/**
 * Whether a layer id is safe to use as a filename and a URL segment.
 *
 * @param id Candidate id.
 */
export function isSafeLayerId( id: unknown ): id is string {
	return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test( id );
}

/**
 * Validates a text source from untrusted input.
 *
 * Deliberately the same rules as `lienzo_validate_text_source()`. The text itself is
 * kept as typed -- it is drawn onto a canvas and never interpreted as markup -- with
 * control characters other than newlines and tabs removed and the length bounded.
 *
 * @param raw Candidate source.
 * @return The normalised source, or null when there is no text in it.
 */
export function normaliseTextSource( raw: unknown ): TextSource | null {
	if ( ! raw || typeof raw !== 'object' ) {
		return null;
	}

	const input = raw as Partial< TextSource >;

	if ( typeof input.text !== 'string' ) {
		return null;
	}

	// eslint-disable-next-line no-control-regex
	const text = input.text.replace( /[^\P{C}\n\t]/gu, '' ).slice( 0, MAX_TEXT_LENGTH );

	if ( ! text.trim() ) {
		return null;
	}

	const size = Number( input.size );
	const strokeWidth = Number( input.strokeWidth ?? 0 );
	const colour =
		typeof input.colour === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test( input.colour )
			? input.colour
			: '#000000';

	return {
		text,
		size: Number.isFinite( size ) ? Math.min( 2000, Math.max( 1, size ) ) : 72,
		family:
			typeof input.family === 'string' && input.family.trim()
				? input.family.slice( 0, 200 )
				: 'sans-serif',
		colour,
		bold: input.bold === true,
		italic: input.italic === true,
		strokeWidth: Number.isFinite( strokeWidth )
			? Math.min( 200, Math.max( 0, strokeWidth ) )
			: 0,
	};
}

/**
 * Validates a layer stack from untrusted input.
 *
 * A document always has at least one layer, so an unusable stack falls back to a
 * single image layer rather than to nothing. A text layer that has lost its words is
 * kept as a raster layer: its pixels, if any, are still worth showing.
 *
 * @param raw      Candidate layers.
 * @param fallback Name for the base layer when rebuilding.
 */
export function normaliseLayers( raw: unknown, fallback = 'Image' ): Layer[] {
	if ( ! Array.isArray( raw ) || raw.length === 0 ) {
		return [ createImageLayer( fallback ) ];
	}

	const layers: Layer[] = [];

	for ( const entry of raw ) {
		if ( ! entry || typeof entry !== 'object' ) {
			continue;
		}

		const layer = entry as Partial< Layer >;
		const opacity = Number( layer.opacity ?? 1 );
		const text = layer.kind === 'text' ? normaliseTextSource( layer.text ) : null;
		const kind: LayerKind =
			layer.kind === 'text'
				? text
					? 'text'
					: 'raster'
				: layer.kind === 'raster'
				? 'raster'
				: 'image';

		layers.push( {
			id: typeof layer.id === 'string' && layer.id ? layer.id : newLayerId(),
			name: typeof layer.name === 'string' ? layer.name : fallback,
			kind,
			transform: normaliseTransform( layer.transform ),
			visible: layer.visible !== false,
			opacity: Number.isFinite( opacity ) ? Math.min( 1, Math.max( 0, opacity ) ) : 1,
			...( text ? { text } : {} ),
		} );
	}

	return layers.length > 0 ? layers : [ createImageLayer( fallback ) ];
}

/**
 * Finds a layer by id.
 *
 * @param layers Layer stack.
 * @param id     Layer id.
 */
export function findLayer( layers: Layer[], id: string ): Layer | undefined {
	return layers.find( ( layer ) => layer.id === id );
}

/**
 * Returns the stack with one layer replaced.
 *
 * @param layers Layer stack.
 * @param id     Layer to replace.
 * @param patch  Fields to change.
 */
export function updateLayer(
	layers: Layer[],
	id: string,
	patch: Partial< Layer >
): Layer[] {
	return layers.map( ( layer ) =>
		layer.id === id ? { ...layer, ...patch } : layer
	);
}

/**
 * Returns the stack with one layer swapped for another, in the same position.
 *
 * How an edit to a text layer lands: the words changed, so the pixels are new, and a
 * new layer id is what lets the old texture stay reachable for undo.
 *
 * @param layers      Layer stack.
 * @param id          Layer to swap out.
 * @param replacement Layer to put in its place.
 */
export function replaceLayer( layers: Layer[], id: string, replacement: Layer ): Layer[] {
	return layers.map( ( layer ) => ( layer.id === id ? replacement : layer ) );
}

/**
 * Moves a layer up or down the stack.
 *
 * @param layers    Layer stack.
 * @param id        Layer to move.
 * @param direction 1 moves it towards the front, -1 towards the back.
 */
export function reorderLayer( layers: Layer[], id: string, direction: 1 | -1 ): Layer[] {
	const index = layers.findIndex( ( layer ) => layer.id === id );
	const target = index + direction;

	if ( index === -1 || target < 0 || target >= layers.length ) {
		return layers;
	}

	const next = [ ...layers ];
	const [ moved ] = next.splice( index, 1 );

	next.splice( target, 0, moved );

	return next;
}
