/**
 * The edit recipe: the resolution-independent description of an edit.
 *
 * This module is the browser half of a contract whose other half is
 * `includes/recipe.php`. The op list and the validation rules must agree exactly:
 * the client builds a recipe, the server validates and stores it, and the client
 * reads it back to restore every slider. When you add an op, add it here, in
 * `lienzo_op_schema()`, and in `src/engine/color-matrix.ts`.
 */

import type { CanvasSize, Layer } from '../document';
import type { Curves, Levels } from '../../engine/lut';

/**
 * Current recipe schema version.
 *
 * - v2 added `curves` and `levels` beside the scalar `ops`.
 * - v3 replaced the single `geometry` block with a `canvas` and a `layer`. The old
 *   model cropped the source directly, which conflated the surface with what sits
 *   on it; see `src/model/document.ts` for why that had to change.
 * - v4 split the layer's single `scale` into `scaleX` and `scaleY`, so an edge
 *   handle can stretch one axis.
 * - v5 replaced the single `layer` with a `layers` stack, which is what pasting
 *   into a new node requires.
 * - v6 added `space`, the working space the adjustments are computed in. A recipe
 *   without one is sRGB, which is what every recipe written before this was.
 */
export const RECIPE_VERSION = 6;

/** Every adjustment AllTerrain Photo Editor understands. */
export type OpType =
	| 'exposure'
	| 'contrast'
	| 'saturation'
	| 'vibrance'
	| 'temperature'
	| 'tint'
	| 'hue'
	| 'sharpen'
	| 'blur'
	| 'vignette'
	| 'grain';

/** A single adjustment. Every op is one scalar, which is what keeps the UI generic. */
export interface Op {
	type: OpType;
	v: number;
}

/** How the rendered result should be encoded. */
export interface RecipeOutput {
	format: string;
	quality: number;
}

/**
 * The space the adjustments are computed in.
 *
 * `srgb` does the arithmetic on the encoded values, which is what core WordPress and
 * most browser editors do, and what every recipe written before this did.
 *
 * `linear` undoes the sRGB transfer curve before applying exposure and puts it back
 * afterwards, so a stop is a doubling of *light* rather than a doubling of a number
 * that only stands for light. Two stops up on a mid grey is the case that shows it:
 * in sRGB the value saturates, in linear it lands where a camera would have put it.
 * Everything else -- contrast pivoting on mid grey, saturation towards luma, the tone
 * curve -- is defined against the encoded values by construction and stays there.
 */
export type WorkingSpace = 'srgb' | 'linear';

/** The working spaces on offer, in picker order. */
export const WORKING_SPACES: WorkingSpace[] = [ 'srgb', 'linear' ];

/** A complete edit. */
export interface Recipe {
	version: number;
	source: number;
	ops: Op[];
	/** The output surface, in pixels. Independent of the image on it. */
	canvas: CanvasSize;
	/**
	 * The layer stack, back to front.
	 *
	 * `image` and `text` layers are reproducible from this description alone. A
	 * `raster` layer holds pixels that exist nowhere else, so a save carries them as a
	 * file of their own beside the recipe -- see `hasRasterLayers()`.
	 */
	layers: Layer[];
	/** Which layer the tools act on. */
	activeLayerId: string;
	curves: Curves;
	levels: Levels;
	output: RecipeOutput;
	/** The space the adjustments are computed in. */
	space: WorkingSpace;
}
