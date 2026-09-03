/**
 * The document model.
 *
 * What an edit is applied *to*: a canvas of a given size, and a stack of layers each
 * positioned on it by a transform. None of it knows how anything is rendered.
 */

export type { LayerTransform } from './transform';
export {
	IDENTITY_TRANSFORM,
	MAX_SCALE,
	MIN_SCALE,
	clampTransform,
	isIdentityTransform,
	layerBounds,
	layerSize,
	normaliseAngle,
	normaliseTransform,
} from './transform';

export type { CanvasSize } from './canvas';
export {
	MIN_CANVAS,
	applyCrop,
	clampCanvas,
	coverScale,
	fitScale,
	isNativeCanvas,
	normaliseCanvas,
	resizeCanvas,
} from './canvas';

export type { Rect } from './rect';
export { centredCrop, clampRect } from './rect';

export type { Layer, LayerKind, TextSource } from './layers';
export {
	BASE_LAYER_ID,
	MAX_TEXT_LENGTH,
	createImageLayer,
	createRasterLayer,
	createTextLayer,
	findLayer,
	isSafeLayerId,
	newLayerId,
	normaliseLayers,
	normaliseTextSource,
	reorderLayer,
	replaceLayer,
	updateLayer,
} from './layers';
