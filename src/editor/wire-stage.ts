/**
 * Wiring the stage.
 *
 * The editor's assembly code: it knows both sides -- the editor's collaborators and
 * every stage widget's option bag -- and exists so that neither of them has to. Split
 * from the editor itself because connecting six widgets to one model is a long list of
 * one-line answers, and a long list of one-line answers reads better on its own.
 */

import { findLayer } from '../model/document';
import { dabRegion } from '../model/pixel-history';
import { StageToolset } from './stage-toolset';
import { SelectionOverlay } from './selection-overlay';
import { panelContext } from './adapters';
import { EditorClipboard } from './clipboard';
import type { ClipboardPixels } from './clipboard';
import { paintTarget } from './paint-target';
import { hitTextLayer } from './text-layer';
import type { Editor } from './editor';

/**
 * Builds the marquee and the clipboard that reads from it.
 *
 * They arrive together because a clipboard with no selection to copy is not useful,
 * and a selection nothing can copy is only half a feature.
 *
 * @param editor The editor.
 */
function wireSelection( editor: Editor ): SelectionOverlay {
	const overlay = new SelectionOverlay( {
		stage: editor.shell.stage,
		getViewport: () => editor.renderer?.view.viewport() ?? null,
		getCanvas: () => editor.store.current.canvas,
		setMask: ( mask ) => editor.renderer?.paint.setPaintMask( mask ),
		onChange: () => editor.stage?.optionsBar.render(),
		maxRasterPixels: editor.config.maxSelectionPixels,
	} );

	editor.selection = overlay;
	editor.clipboard = new EditorClipboard( {
		store: editor.store,
		getPixels: () => clipboardPixels( editor ),
		getSelection: () => overlay.current,
		onPaste: () => editor.state.setTool( 'transform' ),
	} );

	return overlay;
}

/**
 * Builds every stage widget and connects it to the editor.
 *
 * @param editor The editor.
 * @return The assembled toolset.
 */
export function buildStageToolset( editor: Editor ): StageToolset {
	const renderer = editor.renderer!;
	const { state, store, shell } = editor;
	const selection = wireSelection( editor );
	const ctx = panelContext( editor );

	// Several option callbacks reach back into the toolset -- the options bar re-renders
	// when a stage tool changes state, and the stage tools ask the options bar to. The
	// annotation is what lets those close over a binding they are also part of building.
	const toolset: StageToolset = new StageToolset( {
		frame: {
			stage: shell.stage,
			getViewport: () => renderer.view.viewport(),
			getCanvas: () => store.current.canvas,
			getTool: () => state.getTool(),
			getBrush: () => state.getBrush(),
		},
		body: shell.root.querySelector( '.lz-body' ) ?? shell.root,
		optionsHost: shell.options,
		rail: {
			getActive: () => state.getTool(),
			onSelect: ( tool ) => state.setTool( tool ),
			getColours: () => ( {
				colour: state.getBrush().colour,
				background: state.getBrush().background,
			} ),
			setColours: ( patch ) => state.setBrush( patch ),
			onColoursChange: ( listener ) => state.brushes.add( () => listener() ),
			getQuickMask: () => state.getQuickMask(),
			setQuickMask: ( on ) => state.setQuickMask( on ),
			getFullScreen: () => state.getFullScreen(),
			setFullScreen: ( on ) => state.setFullScreen( on ),
		},
		optionsBar: {
			ctx,
			getSelectionShape: () => editor.selectionShape,
			setSelectionShape: ( shape ) => {
				editor.selectionShape = shape;
				shell.stage.dataset.shape = shape;

				// Only the half-placed polygon goes: reaching for the ellipse in order to
				// add one to a rectangle you already have is the ordinary case now, and
				// throwing the rectangle away for it would make the boolean modes
				// unusable across two shapes.
				toolset.tools.clearPath();
			},
			getSelectionMode: () => editor.selectionMode,
			setSelectionMode: ( mode ) => {
				editor.selectionMode = mode;
			},
			hasSelection: () => selection.isActive,
			deselect: () => {
				toolset.tools.clearPath();
				selection.set( null );
			},
			selectAll: () => selection.selectAll(),
			canStepSelectionBack: () => selection.canStepBack,
			stepSelectionBack: () => void selection.stepBack(),
			hasCloneSource: () => !! toolset.tools.getCloneSource(),
			clearCloneSource: () => toolset.tools.clearCloneSource(),
			isTypingText: () => true === toolset.text.isEditing,
			setZoom: ( mode ) => {
				if ( 'fit' === mode ) {
					renderer.view.reset();
				} else {
					renderer.view.zoomToActual();
				}
			},
		},
		tools: {
			setBrush: ( patch ) => state.setBrush( patch ),
			getTargetLayerId: () => paintTarget( store, renderer.paint ),
			stamp: ( id, image, x, y, size, colour, opacity, erase ) => {
				editor.strokes?.capture( id, dabRegion( x, y, size ) );
				renderer.paint.stampBrush( id, image, x, y, size, colour, opacity, erase );
			},
			fillMask: ( id, mask, colour, opacity, origin ) => {
				// Only the rectangle the fill actually reached. A flood fill *can* reach
				// everywhere, and when it does the collector still declines -- but the
				// common case, one object on a large photograph, is now a small patch
				// rather than a whole document offered up and refused.
				editor.strokes?.capture( id, {
					x: origin.x,
					y: origin.y,
					width: mask.width,
					height: mask.height,
				} );
				renderer.paint.fillWithMask( id, mask, colour, opacity, origin.x, origin.y );
			},
			composite: ( id, source, x, y, opacity ) => {
				editor.strokes?.capture( id, {
					x,
					y,
					width: source.width,
					height: source.height,
				} );
				renderer.paint.compositeCanvas( id, source, x, y, opacity );
			},
			readDocument: () => renderer.pixels.readPixels(),
			readPristine: () => renderer.readPristinePixels(),
			getSelectionShape: () => editor.selectionShape,
			getSelectionMode: () => editor.selectionMode,
			previewSelection: ( next ) => selection.setPending( next ),
			previewAnchors: ( anchors ) => selection.setAnchors( anchors ),
			commitSelection: ( next, mode ) => selection.combine( next, mode ),
			pan: ( dx, dy ) => renderer.view.pan( dx, dy ),
			zoomAt: ( factor, x, y ) => renderer.view.zoomAt( factor, x, y ),
			// The clone sample marker reads the same state, so it redraws here too.
			onToolStateChange: () => {
				toolset.optionsBar.render();
				toolset.cursor.draw();
			},
			// `place()` rather than `open()`: a press that finishes one piece of text
			// does not also begin the next one. A press on text that already exists
			// reopens it instead -- text is an object, and clicking an object with the
			// tool that made it is how you get back into it.
			onPlaceText: ( point ) => {
				if ( toolset.text.isEditing ) {
					toolset.text.place( point );

					return;
				}

				const hit = hitTextLayer( store.current, renderer.paint, point );

				if ( hit && editor.editText( hit.id ) ) {
					return;
				}

				toolset.text.place( point );
			},
			maxEdgePixels: editor.config.maxEdgePixels,
			// One history entry per stroke, not per dab -- and it carries the tiles the
			// stroke overwrote, so undoing it puts the pixels back rather than
			// restoring an identical recipe and appearing to do nothing. The stroke is
			// closed first, so the layer holds its final pixels before they are filed.
			onStrokeEnd: () => {
				renderer.paint.endStroke();
				void editor.strokes?.commit();
			},
		},
		text: {
			getStyle: () => {
				const brush = state.getBrush();

				return {
					size: brush.fontSize,
					family: brush.fontFamily,
					colour: brush.colour,
					bold: brush.bold,
					italic: brush.italic,
				};
			},
			onCommit: ( text, point, layerId ) => {
				const changed = layerId
					? editor.replaceText( layerId, text, point )
					: editor.drawText( text, point );

				if ( ! changed ) {
					return;
				}

				// The text arrives as a layer of its own, and what everyone does next is
				// move it -- so hand the stage to transform, the same way a paste does.
				state.setTool( 'transform' );
			},
			// The controls that restyle the text live here; a click on them must not
			// finish it. The top bar's own actions are deliberately left out: pressing
			// Save should commit the caret first, so the render carries the words.
			chrome: [ shell.options, shell.sidebar ],
			onStateChange: () => {
				// The layer being retyped steps out of the picture while the caret is
				// open, and back into it the moment the caret closes -- committed or not.
				if ( ! toolset.text.isEditing ) {
					renderer.hideLayer( null );
				}

				toolset.optionsBar.render();
			},
		},
	} );

	// Double-clicking text with the Transform tool reopens it, the way double-clicking
	// a text box does in every layout program. The hit is taken under the pointer
	// first, and falls back to the active layer for a double-click on its handles.
	const onDoubleClick = ( event: MouseEvent ) => {
		if ( 'transform' !== state.getTool() || toolset.text.isEditing ) {
			return;
		}

		const viewport = renderer.view.viewport();
		const canvas = store.current.canvas;
		const rect = shell.stage.getBoundingClientRect();
		const hit =
			viewport && viewport.width > 0
				? hitTextLayer( store.current, renderer.paint, {
						x:
							( ( event.clientX - rect.left - viewport.x ) / viewport.width ) *
							canvas.width,
						y:
							( ( event.clientY - rect.top - viewport.y ) / viewport.height ) *
							canvas.height,
				  } )
				: null;
		const layer =
			hit ?? findLayer( store.current.layers, store.current.activeLayerId );

		if ( layer?.text && editor.editText( layer.id ) ) {
			event.preventDefault();
		}
	};

	shell.stage.addEventListener( 'dblclick', onDoubleClick );
	editor.onTeardown( () => shell.stage.removeEventListener( 'dblclick', onDoubleClick ) );

	toolset.setRulersVisible( state.getView().rulers );
	shell.stage.classList.toggle( 'has-rulers', state.getView().rulers );

	// The marquee's five shapes share one tool, so the cursor is the only thing on screen
	// that can say which of them a press would start. It reads this.
	shell.stage.dataset.shape = editor.selectionShape;

	// Redrawn on zoom and on any brush change, so the ring resizes under a stationary
	// pointer rather than waiting for the next movement.
	editor.onTeardown(
		renderer.view.onChange( toolset.redraw ),
		renderer.view.onChange( selection.sync ),
		state.brushes.add( toolset.cursor.draw ),
		state.brushes.add( toolset.text.restyle ),
		state.tools.add( toolset.cursor.draw )
	);

	return toolset;
}

/**
 * The two halves of the clipboard's needs, in one object.
 *
 * Copying reads the composed document; pasting writes a layer texture. They live on
 * different parts of the engine, so this is where the two are put back together.
 *
 * @param editor The editor.
 */
function clipboardPixels( editor: Editor ): ClipboardPixels | null {
	const renderer = editor.renderer;

	if ( ! renderer ) {
		return null;
	}

	return {
		extractRegion: ( x, y, width, height ) =>
			renderer.pixels.extractRegion( x, y, width, height ),
		addRasterTexture: ( id, source ) =>
			renderer.paint.addRasterTexture( id, source ),
	};
}
