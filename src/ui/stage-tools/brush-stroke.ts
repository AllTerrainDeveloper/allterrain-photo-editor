/**
 * The strokes that lay down paint.
 */

import { brushStamp } from '../../engine/brush';
import type { Point } from '../../model/selection';
import type { StageToolsOptions } from './types';

/**
 * Stamps one brush dab.
 *
 * No bounds test here on purpose. Rejecting dabs whose *centre* falls outside the
 * selection lets half of every edge dab escape, because a brush is wider than its
 * centre. The renderer masks the stroke instead, clipping it pixel by pixel.
 *
 * @param options Tool wiring.
 * @param point   Canvas coordinates.
 * @param erasing Whether the eraser is active, which removes rather than adds.
 */
export function stampDab(
	options: StageToolsOptions,
	point: Point,
	erasing: boolean
): void {
	const brush = options.getBrush();

	options.stamp(
		options.getTargetLayerId( erasing ),
		brushStamp( brush.shape, brush.size, brush.hardness ),
		point.x,
		point.y,
		brush.size,
		brush.colour,
		brush.opacity,
		erasing
	);
}
