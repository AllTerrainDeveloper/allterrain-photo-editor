/**
 * Bringing the editor up.
 *
 * Four stages, each of which can fail: fetch the payload, decode the pixels, start the
 * renderer, wire the stage to it. Every one of them checks whether the editor was
 * destroyed while it was waiting -- an OpenStation window closed mid-load is not a rare
 * case, and finishing the sequence into a torn-down editor leaks a WebGL context.
 */

import { EditorRenderer } from '../engine/renderer';
import { __, sprintf } from '../i18n';
import { validateRecipe } from '../model/recipe';
import { loadImageBlob, loadSourceImage } from '../net/image-loader';
import { toast } from '../platform';
import { registerBuiltInPanels } from '../ui/panels/built-in';
import { PanelHost } from '../ui/panels';
import { shortcutTarget, panelContext } from './adapters';
import type { Editor } from './editor';
import { attachPasteboard } from './pasteboard';
import { pushToRenderer, retainTextures } from './renderer-sync';
import { attachEditorShortcuts } from './shortcuts';
import { StrokeRecorder } from './stroke-recorder';
import { rasteriseTextLayer } from './text-layer';
import { buildStageToolset } from './wire-stage';
import { attachFileDrop } from '../hosts/desktop-mode/file-drop';

/**
 * Loads the image and brings the editor up.
 *
 * @param editor The editor.
 */
export async function bootEditor( editor: Editor ): Promise< void > {
	try {
		editor.payload = await editor.client.getMedia( editor.options.attachmentId );

		if ( editor.isDestroyed ) {
			return;
		}

		editor.store.load(
			validateRecipe( editor.payload.recipe, editor.payload.schema ),
			editor.payload.schema
		);

		editor.shell.setStatus( __( 'Decoding image…' ) );
		editor.loaded = await loadSourceImage( editor.payload, editor.client );

		if ( editor.isDestroyed ) {
			editor.loaded.release();

			return;
		}

		editor.shell.setStatus( __( 'Starting the renderer…' ) );
		await startRenderer( editor );
	} catch ( error ) {
		fail( editor, error );
	} finally {
		editor.options.onReady?.( editor.payload );
	}
}

/**
 * Starts the renderer and everything that depends on it.
 *
 * @param editor The editor.
 */
async function startRenderer( editor: Editor ): Promise< void > {
	const payload = editor.payload!;
	const renderer = await EditorRenderer.create( {
		host: editor.shell.stage,
		maxRenderPixels: editor.config.maxRenderPixels,
		schema: payload.schema,
		backend: editor.config.renderer,
	} );

	if ( editor.isDestroyed ) {
		renderer.destroy();

		return;
	}

	editor.renderer = renderer;
	renderer.setImage( editor.loaded!.image );

	// A recipe that has never been rendered -- or one migrated up from the old
	// crop-the-source model -- has no canvas yet. The image's own size is the only
	// sensible default.
	const stored = editor.store.current;
	const canvas =
		stored.canvas.width > 0 && stored.canvas.height > 0
			? stored.canvas
			: renderer.imageSize;

	editor.store.replace( { ...stored, canvas }, 'document' );
	editor.strokes = new StrokeRecorder( editor.store, renderer.paint );

	await restoreLayers( editor );

	if ( editor.isDestroyed ) {
		return;
	}

	editor.onTeardown(
		editor.store.subscribe( ( recipe, scope ) => {
			retainTextures( renderer, editor.store.states );
			pushToRenderer( renderer, recipe, scope );
			editor.syncToolbar();
		} ),
		renderer.view.onChange( () =>
			editor.shell.syncBackdrop( renderer.view.viewport() )
		),
		attachPasteboard( editor.shell.stage, () => editor.renderer?.view ?? null )
	);

	editor.shell.syncBackdrop( renderer.view.viewport() );
	editor.stage = buildStageToolset( editor );

	editor.shell.clearStatus();
	buildSidebar( editor );

	pushToRenderer( renderer, editor.store.current, 'all' );
	editor.syncToolbar();
	editor.onTeardown( attachEditorShortcuts( shortcutTarget( editor ) ) );
	// Native windows also accept drops on their empty picker. Other hosts need the
	// same browser-file support once their canvas is ready.
	if ( editor.options.host !== 'window' ) {
		editor.onTeardown( attachFileDrop( editor.shell.stage, ( dropped ) => {
			void editor.addImageLayer( dropped );
		} ) );
	}
	editor.shell.setTitle( payload.title );
}

/**
 * Puts the pixels back behind every layer the recipe describes.
 *
 * A text layer is drawn again from its words. A raster layer's pixels were stored
 * beside the copy when it was saved, and are fetched back here. Either way the layer
 * arrives as it was left, which is the whole promise of re-opening an edit.
 *
 * A layer that cannot be restored is reported and left empty rather than failing the
 * open: the rest of the document is still worth having.
 *
 * @param editor The editor.
 */
async function restoreLayers( editor: Editor ): Promise< void > {
	const renderer = editor.renderer!;
	const stored = editor.payload?.layers ?? {};
	const recipe = editor.store.current;
	const failed: string[] = [];
	let restoring = false;

	for ( const layer of recipe.layers ) {
		if ( 'text' === layer.kind ) {
			rasteriseTextLayer( renderer.paint, layer );

			continue;
		}

		const url = 'raster' === layer.kind ? stored[ layer.id ] : undefined;

		if ( ! url ) {
			continue;
		}

		if ( ! restoring ) {
			restoring = true;
			editor.shell.setStatus( __( 'Restoring layers…' ) );
		}

		try {
			const loaded = await loadImageBlob( await editor.client.getBlob( url ) );

			if ( editor.isDestroyed ) {
				loaded.release();

				return;
			}

			renderer.paint.addRasterTexture( layer.id, loaded.image );
			loaded.release();
		} catch {
			failed.push( layer.name );
		}
	}

	if ( failed.length > 0 ) {
		toast(
			sprintf(
				/* translators: %s: comma-separated layer names. */
				__( 'Some layers could not be restored: %s' ),
				failed.join( ', ' )
			),
			'error'
		);
	}
}

/**
 * Mounts the sidebar's panel stack.
 *
 * The editor owns the model and the renderer; the panels own their own markup.
 * Everything they need arrives through `PanelContext`, which is deliberately the same
 * surface a third-party tool would get.
 *
 * @param editor The editor.
 */
function buildSidebar( editor: Editor ): void {
	registerBuiltInPanels();

	editor.panelHost = new PanelHost( editor.shell.sidebar, panelContext( editor ), () =>
		editor.shell.setSidebarOpen( false )
	);
	editor.shell.restoreSidebar();
}

/**
 * Renders an unrecoverable error.
 *
 * The server's own wording is preferred: "You are not allowed to edit this image" and
 * "The original file is not readable on disk" call for completely different responses
 * from the user, and a generic failure tells them nothing.
 *
 * @param editor The editor.
 * @param error  The failure.
 */
function fail( editor: Editor, error: unknown ): void {
	const message =
		error instanceof Error ? error.message : __( 'The image could not be opened.' );

	editor.shell.setError( message );
	toast( message, 'error' );
}
