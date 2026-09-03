/**
 * The contract between the editor and a panel.
 *
 * `PanelContext` is deliberately the whole of it. A panel -- built-in or third-party --
 * gets this and nothing else, which is the rule that keeps the sidebar extensible: if
 * Layers or Curves cannot be built against this surface, the surface is wrong and
 * should be widened rather than bypassed.
 */

import type { CanvasSize, Layer, LayerTransform } from '../../model/document';
import type { Histogram } from '../../engine/histogram';
import type { Curves, Levels } from '../../engine/lut';
import type { OpType, Recipe, WorkingSpace } from '../../model/recipe';
import type { BrushSettings } from '../stage-tools';
import type { MediaPayload, Preset } from '../../types';

/**
 * Which tool currently owns the stage.
 *
 * Only one can: they all want the same pointer events on the same surface.
 */
export type ActiveTool =
	| 'transform'
	| 'select'
	| 'wand'
	| 'crop'
	| 'eyedropper'
	| 'retouch'
	| 'brush'
	| 'history'
	| 'clone'
	| 'eraser'
	| 'fill'
	| 'gradient'
	| 'tone'
	| 'text'
	| 'shape'
	| 'path'
	| 'hand'
	| 'zoom';

/** Tools that paint into a layer, and so need a raster target and a stroke history. */
export const PAINTING_TOOLS: ActiveTool[] = [
	'brush',
	'history',
	'eraser',
	'fill',
	'gradient',
	'shape',
	'path',
	'text',
	'retouch',
	'tone',
	'clone',
];

/** Preferences about how the stage is presented, not what it contains. */
export interface ViewPrefs {
	rulers: boolean;
	snapping: boolean;
}

/** Where the image sits inside the stage, in stage pixels. */
export interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** What a panel is given when it renders. */
export interface PanelContext {
	/** The image being edited. */
	payload: MediaPayload;
	/** The edit as it currently stands. */
	getRecipe: () => Recipe;
	/** Applies one adjustment, in canonical units. */
	setOp: ( type: OpType, value: number ) => void;
	/** Replaces the output encoding settings without touching undo history. */
	setOutput: ( patch: { format?: string; quality?: number } ) => void;
	/**
	 * Switches the space the adjustments are computed in.
	 *
	 * Undoable, unlike the output settings: this one changes the pixels rather than
	 * how they are encoded.
	 */
	setSpace: ( space: WorkingSpace ) => void;
	/** Moves, scales or rotates the layer. Never touches the canvas. */
	setLayer: ( layer: LayerTransform, label?: string ) => void;
	/** Resizes the canvas and repositions the layer together. */
	setDocument: (
		canvas: CanvasSize,
		layer: LayerTransform,
		label?: string
	) => void;
	/** Native pixel size of the image on the layer. */
	getImageSize: () => CanvasSize;
	/**
	 * Which direct-manipulation tool owns the stage.
	 *
	 * Only one can, because their overlays would otherwise fight over the same
	 * pointer events. Transform is the default, so the handles are there the moment
	 * an image opens rather than waiting for a panel to be expanded.
	 */
	getActiveTool: () => ActiveTool;
	/** Claims the stage for a tool. Pass 'transform' to hand it back. */
	setActiveTool: ( tool: ActiveTool ) => void;
	/** Subscribes to tool changes. */
	onActiveToolChange: ( listener: ( tool: ActiveTool ) => void ) => () => void;
	/** Replaces one curve channel, or clears it. */
	setCurve: ( channel: keyof Curves, points: [ number, number ][] | undefined ) => void;
	/** Replaces the black point, white point and gamma. */
	setLevels: ( levels: Levels ) => void;
	/**
	 * The canvas area.
	 *
	 * A panel that needs direct manipulation -- crop today, layers later -- attaches
	 * its overlay here rather than reaching for the DOM itself.
	 */
	stage: HTMLElement;
	/** Where the image sits inside the stage. Null when nothing is loaded. */
	getViewport: () => Viewport | null;
	/** Subscribes to viewport changes, so an overlay can follow a resize. */
	onViewportChange: ( listener: () => void ) => () => void;
	/** Subscribes to histogram updates. Returns an unsubscribe function. */
	onHistogram: ( listener: ( histogram: Histogram ) => void ) => () => void;
	/** Subscribes to recipe changes, including undo and reset. */
	onRecipeChange: ( listener: ( recipe: Recipe ) => void ) => () => void;
	/** Lists the current user's saved looks. */
	listPresets: () => Promise< Preset[] >;
	/** Saves the current look under a name. */
	savePreset: ( name: string ) => Promise< Preset >;
	/** Deletes a saved look. */
	deletePreset: ( id: string ) => Promise< void >;
	/** Applies a saved look to the current edit, leaving the crop alone. */
	applyPreset: ( preset: Preset ) => void;
	/** The layer stack, back to front. */
	getLayers: () => Layer[];
	/** Which layer the tools act on. */
	getActiveLayerId: () => string;
	/** Replaces the stack, optionally changing which layer is active. */
	setLayers: ( layers: Layer[], activeId?: string ) => void;
	/** Adds an empty layer above the active one and selects it. */
	addLayer: () => void;
	/**
	 * Reopens a text layer for retyping.
	 *
	 * The caret lands over the glyphs with the words in it. A layer that is not text
	 * is left alone.
	 */
	editTextLayer: ( layerId: string ) => void;
	/** Brush, eraser and fill settings, shared by all three. */
	getBrush: () => BrushSettings;
	/** Changes brush settings. */
	setBrush: ( patch: Partial< BrushSettings > ) => void;
	/** Subscribes to brush changes. */
	onBrushChange: ( listener: ( brush: BrushSettings ) => void ) => () => void;
	/** Rulers and snapping. */
	getView: () => ViewPrefs;
	/** Changes view preferences. */
	setView: ( patch: Partial< ViewPrefs > ) => void;
}

/** A registered sidebar tool. */
export interface PanelDef {
	/** Stable identifier, used as the persistence key. */
	id: string;
	/** Heading shown on the panel and in the picker. */
	title: string;
	/** Sort order; lower comes first. Defaults to 100. */
	order?: number;
	/** Whether the panel is shown before the user has expressed a preference. */
	defaultVisible?: boolean;
	/** Whether the panel starts collapsed. */
	defaultCollapsed?: boolean;
	/**
	 * Renders the panel body.
	 *
	 * The body carries `data-collapsed` and emits a `lz-panel-toggle` CustomEvent
	 * whenever that changes, so a panel owning anything outside its own markup can
	 * follow along.
	 *
	 * Return a teardown function to release listeners; it runs when the panel is
	 * hidden or the editor is destroyed.
	 */
	render: ( host: HTMLElement, ctx: PanelContext ) => void | ( () => void );
}
