/**
 * One brush stroke, kept apart from the layer until it is finished.
 *
 * Opacity used to be applied to every dab, and dabs overlap: a stroke lays them down
 * at a fifth of the brush diameter, and a slow drag lays one down on every pointer
 * event. Twenty dabs at twenty percent each is ninety-nine percent, so an eraser set
 * to 20% took everything under it within a second and looked exactly like one set to
 * 100%. The same arithmetic made a 20% brush paint solid colour.
 *
 * Opacity is a property of the stroke, not of the dab. So the dabs are stamped at full
 * strength into a buffer of their own, where overlapping only saturates, and the buffer
 * is laid over a snapshot of the layer at the stroke's opacity -- once per frame while
 * the stroke is in progress, and once more when it ends. The layer's own texture holds
 * the composed result throughout, so everything that reads it sees the stroke as it
 * will be, not as it is being built.
 */

import type { GpuContext, GpuSprite, GpuTarget } from './gpu';
import type { LayerTextures } from './layer-textures';
import type { CanvasSize } from '../../model/document';

/** A stroke in progress. */
export interface StrokeBuffer {
	layerId: string;
	/** Stroke opacity, 0..1. */
	opacity: number;
	/** Whether the stroke removes rather than adds. */
	erase: boolean;
	/** The layer as it stood before the stroke began. */
	base: GpuTarget;
	/** Every dab so far, at full strength. */
	buffer: GpuTarget;
	/** The layer's own texture, rewritten from the other two on every flush. */
	target: GpuTarget;
}

/**
 * Opens a stroke on a layer.
 *
 * @param gpu     Drawing context.
 * @param layers  Layer textures.
 * @param layerId Layer the stroke lands on.
 * @param canvas  Current canvas size, for a layer that has no texture yet.
 * @param opacity Stroke opacity, 0..1.
 * @param erase   Whether the stroke removes rather than adds.
 */
export function beginStroke(
	gpu: GpuContext,
	layers: LayerTextures,
	layerId: string,
	canvas: CanvasSize,
	opacity: number,
	erase: boolean
): StrokeBuffer {
	const target = layers.ensurePaintable( layerId, canvas );
	const base = gpu.createTarget( target.width, target.height );
	const snapshot = gpu.sprite( target );

	gpu.draw( snapshot, base, true );
	snapshot.destroy();

	return {
		layerId,
		opacity: Math.min( 1, Math.max( 0, opacity ) ),
		erase,
		base,
		buffer: gpu.createTarget( target.width, target.height ),
		target,
	};
}

/**
 * Adds one dab to the stroke.
 *
 * At full strength, whatever the stroke's opacity: two dabs on the same spot must read
 * as one dab, not as a darker one, and normal blending at alpha one is what saturates
 * rather than accumulates.
 *
 * @param gpu    Drawing context.
 * @param layers Layer textures, which hold the selection mask.
 * @param stroke Stroke in progress.
 * @param sprite The dab, already sized, placed and tinted. Destroyed afterwards.
 */
export function stampIntoStroke(
	gpu: GpuContext,
	layers: LayerTextures,
	stroke: StrokeBuffer,
	sprite: GpuSprite
): void {
	sprite.alpha = 1;

	const clip = layers.clip( sprite );

	gpu.draw( clip.container, stroke.buffer );
	clip.release();
}

/**
 * Rewrites the layer from the snapshot and the dabs so far.
 *
 * @param gpu    Drawing context.
 * @param stroke Stroke in progress.
 */
export function flushStroke( gpu: GpuContext, stroke: StrokeBuffer ): void {
	const base = gpu.sprite( stroke.base );

	gpu.draw( base, stroke.target, true );
	base.destroy();

	const overlay = gpu.sprite( stroke.buffer );

	overlay.alpha = stroke.opacity;

	if ( stroke.erase ) {
		// Removes the destination's alpha rather than painting over it, scaled by the
		// stroke's opacity -- so a 20% eraser leaves 80% of what was there, however
		// many times the brush crossed it.
		overlay.blendMode = 'erase';
	}

	gpu.drawDetached( overlay, stroke.target );
}

/**
 * Frees the stroke's working textures.
 *
 * @param stroke Stroke to release.
 */
export function releaseStroke( stroke: StrokeBuffer ): void {
	stroke.base.destroy( true );
	stroke.buffer.destroy( true );
}
