/**
 * The document, and every legal way to change it.
 *
 * Pulled out of the editor because it is the one part with no DOM in it at all: a
 * recipe, an undo stack, and the mutations the UI is allowed to perform. Everything
 * that used to reach into the history directly now goes through a named method, which
 * is what makes the rules -- what coalesces into one undo step, what never enters
 * history at all -- statements rather than conventions.
 *
 * The history mechanics live in `UndoableStore`; what is here is what those mechanics
 * mean for a recipe.
 */

import type { Curves, Levels } from '../engine/lut';
import type { PixelPatch } from '../model/pixel-history';
import type { CanvasSize, Layer, LayerTransform } from '../model/document';
import {
	defaultRecipe,
	isIdentity,
	normaliseSpace,
	resetOps,
	setCurve,
	setDocument,
	setLayer,
	setLayers,
	setLevels,
	setOp,
} from '../model/recipe';
import type { OpType, Recipe, WorkingSpace } from '../model/recipe';
import type { OpSchema, Preset } from '../types';
import { UndoableStore } from './undoable-store';

/**
 * Which part of the renderer a change invalidates.
 *
 * `document` covers the canvas and the layer stack, `tone` the curves and levels,
 * `ops` the scalar adjustments, and `all` is for changes -- undo, reset, a preset --
 * that could have touched any of them.
 */
export type RecipeScope = 'ops' | 'document' | 'tone' | 'all';

/**
 * The edit in progress, its history, and the mutations the UI can perform.
 */
export class RecipeStore extends UndoableStore< Recipe, RecipeScope, PixelPatch > {
	private schema: OpSchema;

	/**
	 * @param initial Starting recipe.
	 * @param schema  Op schema, which bounds every adjustment.
	 */
	constructor( initial: Recipe, schema: OpSchema ) {
		super( initial );
		this.schema = schema;
	}

	/**
	 * Starts a fresh document.
	 *
	 * @param recipe New recipe.
	 * @param schema Op schema for the new image.
	 */
	load( recipe: Recipe, schema: OpSchema ): void {
		this.reload( recipe );
		this.schema = schema;
	}

	/**
	 * Whether the edit would produce the original image unchanged.
	 *
	 * @param source Native size of the source image, when known.
	 */
	isIdentity( source?: CanvasSize ): boolean {
		return isIdentity( this.current, source );
	}

	/**
	 * Applies one adjustment.
	 *
	 * @param type  Op to change.
	 * @param value New canonical value.
	 */
	setOp( type: OpType, value: number ): void {
		// Labelled with the op so History coalesces a whole drag into one undo step.
		this.push( setOp( this.current, type, value, this.schema ), type, 'ops' );
	}

	/**
	 * Moves, scales or rotates the layer.
	 *
	 * The canvas is untouched, which is precisely why a transform drag is stable: the
	 * surface the pointer is measured against cannot move underneath it.
	 *
	 * @param transform New layer transform.
	 * @param label     History label; a drag passes a stable one so it coalesces.
	 */
	setLayerTransform( transform: LayerTransform, label = 'transform' ): void {
		this.push( setLayer( this.current, transform ), label, 'document' );
	}

	/**
	 * Resizes the canvas and repositions the layer together.
	 *
	 * @param canvas    New canvas size.
	 * @param transform New layer transform.
	 * @param label     History label.
	 */
	setDocument(
		canvas: CanvasSize,
		transform: LayerTransform,
		label = 'canvas'
	): void {
		this.push( setDocument( this.current, canvas, transform ), label, 'document' );
	}

	/**
	 * Replaces the layer stack.
	 *
	 * @param layers   New stack.
	 * @param activeId Optional. Which layer becomes active.
	 * @param undoable Optional. False folds the change into the current entry, for a
	 *                 layer that exists only because a stroke needed somewhere to go.
	 * @param label    Optional. History label. Consecutive changes sharing one coalesce,
	 *                 so a change that must stand as its own undo step -- retyping a text
	 *                 layer, right after selecting it -- passes a label of its own.
	 */
	setLayers(
		layers: Layer[],
		activeId?: string,
		undoable = true,
		label = 'layers'
	): void {
		const next = setLayers( this.current, layers, activeId );

		if ( undoable ) {
			this.push( next, label, 'document' );
		} else {
			this.replace( next, 'document' );
		}
	}

	/**
	 * Replaces one curve channel.
	 *
	 * @param channel Curve channel.
	 * @param points  Control points, or undefined to clear.
	 */
	setCurve( channel: keyof Curves, points: [ number, number ][] | undefined ): void {
		this.push( setCurve( this.current, channel, points ), `curve-${ channel }`, 'tone' );
	}

	/**
	 * Replaces the black point, white point and gamma.
	 *
	 * @param levels New levels.
	 */
	setLevels( levels: Levels ): void {
		this.push( setLevels( this.current, levels ), 'levels', 'tone' );
	}

	/**
	 * Updates the output settings.
	 *
	 * Not pushed onto the undo stack: format and quality describe how the edit is
	 * encoded, not the edit itself, and interleaving them with adjustment history
	 * would make undo behave unpredictably.
	 *
	 * @param patch Fields to change.
	 */
	setOutput( patch: { format?: string; quality?: number } ): void {
		const current = this.current;

		this.replace( { ...current, output: { ...current.output, ...patch } }, 'document' );
	}

	/**
	 * Switches the working space the adjustments are computed in.
	 *
	 * Undoable, unlike the output settings beside it: this one changes the pixels. An
	 * exposure set in sRGB lands somewhere else in linear light, and a user who does
	 * not like where it landed should be able to press undo rather than hunt for the
	 * control again.
	 *
	 * @param space New working space.
	 */
	setSpace( space: WorkingSpace ): void {
		if ( this.current.space === space ) {
			return;
		}

		this.push( { ...this.current, space }, 'space', 'ops' );
	}

	/**
	 * Applies a saved look, keeping this image's own geometry.
	 *
	 * Geometry is deliberately untouched. A preset describes a look; the crop
	 * describes this particular frame, and replacing it would silently re-crop the
	 * photograph the moment a look was applied.
	 *
	 * The working space *is* part of the look, and comes with it: it decides what an
	 * exposure op means, so a look made in linear light and replayed in sRGB is a
	 * different look. A preset saved before the field existed was made in sRGB.
	 *
	 * @param preset Preset to apply.
	 */
	applyPreset( preset: Preset ): void {
		const current = this.current;

		this.push(
			{
				...current,
				ops: preset.recipe.ops ?? [],
				curves: preset.recipe.curves ?? {},
				levels: preset.recipe.levels ?? current.levels,
				space: normaliseSpace( preset.recipe.space ),
			},
			'preset',
			'all'
		);
	}

	/**
	 * Returns every adjustment to zero.
	 *
	 * @param source Native size of the source image, when known.
	 * @return True when there was something to reset.
	 */
	reset( source?: CanvasSize ): boolean {
		if ( this.isIdentity( source ) ) {
			return false;
		}

		this.push( resetOps( this.current, source ), 'reset', 'all' );

		return true;
	}

	/**
	 * Files a finished stroke as one undo entry.
	 *
	 * The recipe itself has not changed -- the pixels have -- so the entry carries the
	 * tiles the stroke overwrote. Without them, undoing a stroke would restore an
	 * identical recipe and appear to do nothing at all.
	 *
	 * @param patch Tiles as they stood before the stroke.
	 */
	pushStroke( patch: PixelPatch ): void {
		this.push( { ...this.current }, 'paint', 'document', patch );
	}
}

/**
 * A store for an image that has not loaded yet.
 *
 * `mount()` returns before the media payload arrives, so there has to be something
 * coherent to answer `getRecipe()` in the meantime.
 *
 * @param attachmentId Attachment being opened.
 */
export function emptyStore( attachmentId: number ): RecipeStore {
	return new RecipeStore( defaultRecipe( attachmentId ), {} );
}
