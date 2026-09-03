/**
 * What a panel is handed.
 *
 * Built in one place because `PanelContext` is a published contract: it is the same
 * surface a third-party tool gets, so a Layers panel added later must not need
 * anything the built-ins get for free. Keeping the construction here rather than
 * inline in the editor makes it obvious when that surface grows.
 */

import type { RestClient } from '../net/rest';
import type { MediaPayload } from '../types';
import type { ActiveTool, PanelContext, ViewPrefs, Viewport } from '../ui/panels';
import type { BrushSettings } from '../ui/stage-tools';
import type { CanvasSize } from '../model/document';
import type { Histogram } from '../engine/histogram';
import type { RecipeStore } from './recipe-store';
import { Subscribers } from './subscribers';

/** Everything the context needs that is not the store or the client. */
export interface PanelContextDeps {
	store: RecipeStore;
	client: RestClient;
	/** The loaded image. Only ever called once one exists. */
	getPayload: () => MediaPayload;
	/** The canvas area, for a panel that attaches an overlay. */
	stage: HTMLElement;
	/** Native pixel size of whatever backs the active layer. */
	getImageSize: () => CanvasSize;
	getActiveTool: () => ActiveTool;
	setActiveTool: ( tool: ActiveTool ) => void;
	getBrush: () => BrushSettings;
	setBrush: ( patch: Partial< BrushSettings > ) => void;
	getView: () => ViewPrefs;
	setView: ( patch: Partial< ViewPrefs > ) => void;
	addLayer: () => void;
	editTextLayer: ( layerId: string ) => void;
	getViewport: () => Viewport | null;
	onViewportChange: ( listener: () => void ) => () => void;
	onHistogram: ( listener: ( histogram: Histogram ) => void ) => () => void;
	/** Fired when the active tool changes. */
	toolListeners: Subscribers< [ ActiveTool ] >;
	/** Fired when any brush setting changes, from the panel or the options bar. */
	brushListeners: Subscribers< [ BrushSettings ] >;
}

/**
 * Assembles the context handed to every panel and to the options bar.
 *
 * @param deps Editor collaborators the context reads through.
 */
export function buildPanelContext( deps: PanelContextDeps ): PanelContext {
	const { store } = deps;

	return {
		payload: deps.getPayload(),
		getRecipe: () => store.current,
		setOp: ( type, value ) => store.setOp( type, value ),
		setOutput: ( patch ) => store.setOutput( patch ),
		setSpace: ( space ) => store.setSpace( space ),
		setLayer: ( layer, label ) => store.setLayerTransform( layer, label ),
		setDocument: ( canvas, layer, label ) => store.setDocument( canvas, layer, label ),
		getImageSize: deps.getImageSize,
		getActiveTool: deps.getActiveTool,
		setActiveTool: deps.setActiveTool,
		onActiveToolChange: ( listener ) => deps.toolListeners.add( listener ),
		setCurve: ( channel, points ) => store.setCurve( channel, points ),
		setLevels: ( levels ) => store.setLevels( levels ),
		stage: deps.stage,
		getViewport: deps.getViewport,
		onViewportChange: deps.onViewportChange,
		onHistogram: deps.onHistogram,
		onRecipeChange: ( listener ) =>
			store.subscribe( ( recipe ) => listener( recipe ) ),
		listPresets: () => deps.client.getPresets(),
		savePreset: ( name ) => deps.client.createPreset( name, store.current ),
		deletePreset: ( id ) => deps.client.deletePreset( id ),
		applyPreset: ( preset ) => store.applyPreset( preset ),
		getLayers: () => store.current.layers,
		getActiveLayerId: () => store.current.activeLayerId,
		setLayers: ( layers, activeId ) => store.setLayers( layers, activeId ),
		addLayer: deps.addLayer,
		editTextLayer: deps.editTextLayer,
		getBrush: deps.getBrush,
		setBrush: deps.setBrush,
		getView: deps.getView,
		setView: deps.setView,
		onBrushChange: ( listener ) => deps.brushListeners.add( listener ),
	};
}
