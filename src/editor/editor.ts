/**
 * The editor.
 *
 * A coordinator rather than an implementation. Everything with a job of its own -- the
 * document, the chrome, the toolbar, the marquee, the clipboard, the stroke history,
 * the output path -- lives in its own module; what is left here is the state those
 * modules share and the lifecycle that owns them.
 *
 * Its collaborators are public rather than private. They are not an API -- nothing
 * outside this package should touch them -- but the modules that assemble the editor
 * (`boot`, `wire-stage`, `adapters`, `commands`) are its own code split for length,
 * and hiding fields from them would buy nothing but indirection.
 */

import type { EditorRenderer } from '../engine/renderer';
import { findLayer } from '../model/document';
import type { CanvasSize } from '../model/document';
import type { Recipe } from '../model/recipe';
import type { SelectionMode, SelectionShape } from '../model/selection';
import type { LoadedImage } from '../net/image-loader';
import { RestClient } from '../net/rest';
import type { LienzoConfig, MediaPayload } from '../types';
import type { PanelHost } from '../ui/panels';
import { bootEditor } from './boot';
import { activeLayerSize, editorDebug, toolbarState } from './queries';
import type { EditorClipboard } from './clipboard';
import { redo, resetAll, save, undo } from './commands';
import { readConfig } from './config';
import { EditorUiState } from './editor-state';
import { stateEffects } from './state-effects';
import { importTarget } from './adapters';
import type { DroppedImage } from './image-source';
import { addImageLayer } from './layer-import';
import { drawTextLayer, replaceTextLayer, textPlacement } from './text-layer';
import { OutputController } from './output';
import { emptyStore } from './recipe-store';
import type { SelectionOverlay } from './selection-overlay';
import { EditorShell } from './shell';
import type { StageToolset } from './stage-toolset';
import type { StrokeRecorder } from './stroke-recorder';
import { EditorToolbar } from './toolbar';
import type { EditorInstance, MountOptions } from './types';

/**
 * The editor.
 */
export class Editor implements EditorInstance {
	readonly options: MountOptions;

	readonly config: LienzoConfig;

	readonly client: RestClient;

	readonly store = emptyStore( 0 );

	readonly shell: EditorShell;

	readonly state: EditorUiState;

	readonly toolbar: EditorToolbar;

	readonly output: OutputController;

	/** Which shape the marquee tool draws. */
	selectionShape: SelectionShape = 'rect';

	/**
	 * What a newly drawn region does to the selection already in place.
	 *
	 * Sticky, as it is in every editor that has it: a mode chosen in the options bar
	 * stays chosen until it is changed, and the modifier keys override it for the length
	 * of one gesture without disturbing it.
	 */
	selectionMode: SelectionMode = 'new';

	payload: MediaPayload | null = null;

	renderer: EditorRenderer | null = null;

	loaded: LoadedImage | null = null;

	panelHost: PanelHost | null = null;

	selection: SelectionOverlay | null = null;

	strokes: StrokeRecorder | null = null;

	clipboard: EditorClipboard | null = null;

	stage: StageToolset | null = null;

	/** True while a full-resolution render is in flight. */
	private busy = false;

	private destroyed = false;

	private detach: Array< () => void > = [];

	/**
	 * @param element Element to fill. Its contents are replaced.
	 * @param options Mount options.
	 */
	constructor( element: HTMLElement, options: MountOptions ) {
		this.options = options;
		this.config = readConfig();
		this.client = new RestClient( this.config );
		this.store = emptyStore( options.attachmentId );

		this.shell = new EditorShell( {
			root: element,
			host: options.host ?? 'page',
			onSidebarToggle: () => this.renderer?.view.fit(),
		} );

		this.state = new EditorUiState( stateEffects( this ) );

		this.toolbar = new EditorToolbar( this.shell.actions, {
			undo: () => undo( this ),
			redo: () => redo( this ),
			reset: () => resetAll( this ),
			recentre: () => this.renderer?.view.reset(),
			save: () => void save( this ),
			exportToDevice: () => void this.output.exportToDevice(),
			setBypass: ( on ) => this.renderer?.setBypass( on ),
			...( options.onClose ? { close: options.onClose } : {} ),
		} );

		this.output = new OutputController( {
			store: this.store,
			client: this.client,
			maxUploadBytes: this.config.maxUploadBytes,
			getRenderer: () => this.renderer,
			getPayload: () => this.payload,
			isDestroyed: () => this.destroyed,
			setBusy: ( busy ) => {
				this.busy = busy;
				this.syncToolbar();
			},
		} );

		this.syncToolbar();
	}

	/** True once `destroy()` has run, so a load in flight can stand down. */
	get isDestroyed(): boolean {
		return this.destroyed;
	}

	/** Loads the image and brings the editor up. */
	boot(): Promise< void > {
		return bootEditor( this );
	}

	/** Renderer internals, for diagnosing render problems from the console. */
	debug(): Record< string, unknown > {
		return editorDebug( this );
	}

	/** Enables or disables the toolbar buttons to match the state. */
	syncToolbar(): void {
		this.toolbar.sync( toolbarState( this, this.busy ) );
	}

	/** The native pixel size of whatever backs the active layer. */
	activeLayerSize(): CanvasSize {
		return activeLayerSize( this );
	}

	/** Current edit. */
	getRecipe(): Recipe {
		return this.store.current;
	}

	/**
	 * Replaces the current edit.
	 *
	 * @param recipe New recipe.
	 */
	setRecipe( recipe: Recipe ): void {
		this.store.push( recipe, 'set-recipe', 'all' );
	}

	/**
	 * Adds an image to the document as a new layer.
	 *
	 * @param dropped What was dropped, and where.
	 * @return True when a layer was added.
	 */
	addImageLayer( dropped: DroppedImage ): Promise< boolean > {
		return addImageLayer( importTarget( this ), dropped );
	}

	/**
	 * Turns typed text into a layer of its own.
	 *
	 * @param text  What was typed.
	 * @param point Canvas coordinates of the first line's top-left corner.
	 * @return True when a layer was added.
	 */
	drawText( text: string, point: { x: number; y: number } ): boolean {
		return drawTextLayer( importTarget( this ), text, point );
	}

	/**
	 * Reopens a text layer for retyping.
	 *
	 * The caret lands over the glyphs, filled with the words, styled the way they are
	 * drawn -- so the options bar shows the layer's own font and colour, and changing
	 * either restyles the text live. The layer itself steps out of the picture while
	 * the caret is open, or there would be two copies of the text on screen.
	 *
	 * @param layerId Text layer to edit.
	 * @return True when the caret opened.
	 */
	editText( layerId: string ): boolean {
		const recipe = this.store.current;
		const layer = findLayer( recipe.layers, layerId );
		const renderer = this.renderer;
		const stage = this.stage;

		if ( ! layer?.text || ! renderer || ! stage ) {
			return false;
		}

		const placement = textPlacement( layer, recipe.canvas );

		if ( ! placement ) {
			return false;
		}

		if ( recipe.activeLayerId !== layerId ) {
			this.store.setLayers( recipe.layers, layerId );
		}

		const source = layer.text;

		this.state.setBrush( {
			fontSize: source.size,
			fontFamily: source.family,
			colour: source.colour,
			bold: source.bold,
			italic: source.italic,
			shapeStyle: source.strokeWidth > 0 ? 'stroke' : 'fill',
			...( source.strokeWidth > 0 ? { strokeWidth: source.strokeWidth } : {} ),
		} );
		this.state.setTool( 'text' );

		renderer.hideLayer( layerId );
		stage.text.open( placement.point, {
			initial: source.text,
			layerId,
			scale: placement.scale,
		} );

		return true;
	}

	/**
	 * Replaces a text layer's words.
	 *
	 * @param layerId Text layer to retype.
	 * @param text    The new words. Empty removes the layer.
	 * @param point   Canvas coordinates of the first line's top-left corner.
	 * @return True when the document changed.
	 */
	replaceText( layerId: string, text: string, point: { x: number; y: number } ): boolean {
		return replaceTextLayer( importTarget( this ), layerId, text, point );
	}

	/**
	 * Registers teardown callbacks.
	 *
	 * @param offs Detach functions.
	 */
	onTeardown( ...offs: Array< () => void > ): void {
		this.detach.push( ...offs );
	}

	/** Releases everything this editor owns. */
	destroy(): void {
		if ( this.destroyed ) {
			return;
		}

		this.destroyed = true;

		for ( const off of this.detach ) {
			off();
		}
		this.detach = [];

		this.stage?.destroy();
		this.stage = null;
		this.selection?.destroy();
		this.selection = null;
		this.clipboard = null;
		this.strokes = null;
		this.toolbar.destroy();
		this.panelHost?.destroy();
		this.panelHost = null;
		this.state.clear();

		this.renderer?.destroy();
		this.renderer = null;

		this.loaded?.release();
		this.loaded = null;

		this.shell.destroy();
	}
}
