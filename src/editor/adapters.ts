/**
 * The narrow views the editor's collaborators see.
 *
 * Three of them -- layer import, the shortcut table, the panel context -- take an
 * interface rather than the editor, so they can be read and tested without one. These
 * builders are the seam: the only code that knows both the editor's internals and what
 * each collaborator actually needs.
 */

import { addLayer, redo, undo } from './commands';
import type { Editor } from './editor';
import type { ImportTarget } from './layer-import';
import { buildPanelContext } from './panel-context';
import type { ShortcutTarget } from './shortcuts';
import type { PanelContext } from '../ui/panels';

/**
 * What layer import reads through.
 *
 * @param editor The editor.
 */
export function importTarget( editor: Editor ): ImportTarget {
	return {
		store: editor.store,
		client: editor.client,
		renderer: editor.renderer?.paint ?? null,
		stage: editor.shell.stage,
		getViewport: () => editor.renderer?.view.viewport() ?? null,
		getTextStyle: () => {
			const brush = editor.state.getBrush();

			return {
				size: brush.fontSize,
				family: brush.fontFamily,
				colour: brush.colour,
				bold: brush.bold,
				italic: brush.italic,
				strokeWidth: 'stroke' === brush.shapeStyle ? brush.strokeWidth : 0,
			};
		},
		isDestroyed: () => editor.isDestroyed,
		setActiveTool: ( tool ) => editor.state.setTool( tool ),
	};
}

/**
 * What the keyboard shortcuts act on.
 *
 * @param editor The editor.
 */
export function shortcutTarget( editor: Editor ): ShortcutTarget {
	return {
		undo: () => undo( editor ),
		redo: () => redo( editor ),
		copy: () => editor.clipboard?.copy(),
		paste: () => editor.clipboard?.paste(),
		selectAll: () => editor.selection?.selectAll(),
		deselect: () => {
			editor.stage?.tools.clearPath();
			editor.selection?.set( null );
		},
		stepSelectionBack: () => void editor.selection?.stepBack(),
		hasSelection: () => true === editor.selection?.isActive,
		hasPendingPath: () => true === editor.stage?.tools.hasPath,
		getTool: () => editor.state.getTool(),
		getSelectionShape: () => editor.selectionShape,
		commitPath: () => true === editor.stage?.tools.commitPath(),
		closeShape: () => void editor.stage?.tools.closeShape(),
		undoAnchor: () => true === editor.stage?.tools.undoAnchor(),
		clearPath: () => editor.stage?.tools.clearPath(),
		resetView: () => editor.renderer?.view.reset(),
	};
}

/**
 * Everything a panel or the options bar is given.
 *
 * @param editor The editor.
 */
export function panelContext( editor: Editor ): PanelContext {
	return buildPanelContext( {
		store: editor.store,
		client: editor.client,
		// Only ever called once an image is loaded, so the non-null assertion is
		// carrying a real invariant rather than papering over one.
		getPayload: () => editor.payload!,
		stage: editor.shell.stage,
		getImageSize: () => editor.activeLayerSize(),
		getActiveTool: () => editor.state.getTool(),
		setActiveTool: ( tool ) => editor.state.setTool( tool ),
		getBrush: () => editor.state.getBrush(),
		setBrush: ( patch ) => editor.state.setBrush( patch ),
		getView: () => editor.state.getView(),
		setView: ( patch ) => editor.state.setView( patch ),
		addLayer: () => addLayer( editor ),
		editTextLayer: ( layerId ) => void editor.editText( layerId ),
		getViewport: () => editor.renderer?.view.viewport() ?? null,
		onViewportChange: ( listener ) =>
			editor.renderer?.view.onChange( listener ) ?? ( () => {} ),
		onHistogram: ( listener ) =>
			editor.renderer?.onHistogram( listener ) ?? ( () => {} ),
		toolListeners: editor.state.tools,
		brushListeners: editor.state.brushes,
	} );
}
