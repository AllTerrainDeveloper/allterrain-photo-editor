/**
 * What the pointer controller is wired to, and the per-tool constants it reads.
 */

import type { CanvasSize } from '../../model/document';
import type {
	Selection,
	SelectionAnchor,
	SelectionMode,
	SelectionShape,
} from '../../model/selection';
import type { PixelOp } from '../../engine/pixel-tools';
import type { ActiveTool } from '../panels';
import type { BrushSettings } from './brush-settings';

export interface StageToolsOptions {
	stage: HTMLElement;
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	getCanvas: () => CanvasSize;
	getTool: () => ActiveTool;
	getBrush: () => BrushSettings;
	/** Changes a setting -- the eyedropper picks a colour this way. */
	setBrush: ( patch: Partial< BrushSettings > ) => void;
	/**
	 * The layer strokes land on.
	 *
	 * Erasing asks for one with pixels on it to take away, which is not always the one
	 * paint would go to -- see `eraseTarget()`.
	 */
	getTargetLayerId: ( erasing?: boolean ) => string;
	/** Stamps one dab into a layer. */
	stamp: (
		layerId: string,
		image: HTMLCanvasElement,
		x: number,
		y: number,
		size: number,
		colour: string,
		opacity: number,
		erase: boolean
	) => void;
	/** Draws a mask into a layer at a position, for fill. */
	fillMask: (
		layerId: string,
		mask: HTMLCanvasElement,
		colour: string,
		opacity: number,
		/** Where the mask's top-left corner sits, in canvas pixels. */
		origin: { x: number; y: number }
	) => void;
	/** Draws a bitmap into a layer, for gradients, shapes, text and retouching. */
	composite: (
		layerId: string,
		source: HTMLCanvasElement,
		x: number,
		y: number,
		opacity: number
	) => void;
	/** Reads the composed document, for flood fill's colour matching. */
	readDocument: () => { pixels: Uint8ClampedArray; width: number; height: number } | null;
	/** Reads the image without any painted layer, for the history brush. */
	readPristine: () => { pixels: Uint8ClampedArray; width: number; height: number } | null;
	/** Which shape the marquee draws. */
	getSelectionShape: () => SelectionShape;
	/** What a newly drawn region does to the selection already in place. */
	getSelectionMode: () => SelectionMode;
	/**
	 * Shows a region being drawn, without committing it.
	 *
	 * The marquee following the pointer, and the vertices of a polygon or a pen path
	 * placed so far. Null takes the outline down.
	 */
	previewSelection: ( selection: Selection | null ) => void;
	/**
	 * Marks the points a magnetic trace has committed to.
	 *
	 * Separate from the outline because they are separate facts: the outline says what
	 * would be selected, and these say how much of it is already settled. An empty list
	 * takes the marks down.
	 */
	previewAnchors: ( anchors: SelectionAnchor[] ) => void;
	/**
	 * Folds a finished region into the selection.
	 *
	 * @param selection Region drawn, or null when the gesture produced nothing.
	 * @param mode      What that region does to the selection already in place.
	 */
	commitSelection: ( selection: Selection | null, mode: SelectionMode ) => void;
	/** Moves the view, in CSS pixels. */
	pan: ( dx: number, dy: number ) => void;
	/** Zooms about a point given in stage-relative CSS pixels. */
	zoomAt: ( factor: number, x: number, y: number ) => void;
	/** Called once a stroke finishes, for history. */
	onStrokeEnd: () => void;
	/** Called when a tool wants the options bar redrawn -- a clone source, say. */
	onToolStateChange?: () => void;
	/**
	 * Called when the text tool is clicked.
	 *
	 * The caret belongs on the canvas, so placing text is opening an editor at a point
	 * rather than stamping a string held elsewhere.
	 */
	onPlaceText: ( point: { x: number; y: number } ) => void;
	/**
	 * Optional. Ceiling on the magnetic lasso's edge field, in pixels.
	 *
	 * From `lienzo_max_edge_pixels`, by way of the config blob. Left out, the
	 * detector's own default applies.
	 */
	maxEdgePixels?: number;
}

/** How much of a dab's width a retouching stroke advances before the next one. */
export const RETOUCH_SPACING = 0.25;

/** The tools that work on pixels rather than laying down paint. */
export const PIXEL_TOOLS: ActiveTool[] = [ 'retouch', 'tone', 'clone', 'history' ];

/**
 * Which operation each pixel tool performs.
 *
 * Retouch and tone choose theirs from the options bar, so they are absent here and
 * fall through to the brush setting.
 */
export const PIXEL_OPS: Partial< Record< ActiveTool, PixelOp > > = {
	clone: 'clone',
	history: 'restore',
	tone: undefined,
};
