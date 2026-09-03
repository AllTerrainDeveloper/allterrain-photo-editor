/**
 * The native window.
 *
 * Rendered into the parent shell's DOM rather than a chromeless iframe, which is what
 * gives the editor the shell's Pixi, its component kit and its drag bridge.
 */

import { mount } from '../../editor';
import type { DroppedImage, EditorInstance } from '../../editor';
import { __ } from '../../i18n';
import { renderPicker } from '../../ui/picker';
import { state, takePending, takePendingOrigin, WINDOW_ID } from './desktop-api';
import type { NativeRenderContext } from './desktop-api';
import type { PostOrigin } from '../../types';
import { registerDropTarget } from './drop-target';
import { attachFileDrop } from './file-drop';
import { attachDragOut } from './drag-out';

/**
 * Installs the render callback the shell calls when the window opens.
 *
 * Called at module scope rather than from `boot()`: `boot()` waits for
 * `DOMContentLoaded`, and the shell may restore a saved window before then, find no
 * callback registered under this id, and leave the body blank.
 *
 * Registration is the whole fix. An earlier version also swept the DOM for empty roots
 * and rendered into them, which looked like cheap insurance and was not: the shell
 * renders into that same root a moment later, so the window ended up with two live
 * closures over one element and `openInDesktop()` drove the stale one -- it reported
 * success and changed nothing.
 */
export function registerNativeWindow(): void {
	const render = ( body: HTMLElement, ctx?: unknown ) =>
		renderWindow( body, ctx as NativeRenderContext | undefined );

	// Registered under both names. The shell reads whichever one its own version
	// wrote -- `openStationNativeWindows` since the rename, `desktopModeNativeWindows`
	// before it -- and a window registered under the name this shell does not read is
	// a window that opens to a spinner and never fills.
	for ( const key of [
		'openStationNativeWindows',
		'desktopModeNativeWindows',
	] ) {
		const holder = window as unknown as Record<
			string,
			Record< string, typeof render > | undefined
		>;

		holder[ key ] ??= {};
		( holder[ key ] as Record< string, typeof render > )[ WINDOW_ID ] = render;
	}
}

/**
 * Renders the editor into a native window body.
 *
 * The shell clones the registered `<template>` into the body before calling this,
 * so the mount point is already there to be found rather than created. The App
 * Framework path arrives here too, from `src/app.ts`, with the root its client view
 * painted.
 *
 * @param body Window body element.
 * @param ctx  Optional. The shell's render context, for its loading state.
 * @return Teardown, captured by the shell and run on close.
 */
export function renderWindow(
	body: HTMLElement,
	ctx?: NativeRenderContext
): () => void {
	const root =
		body.querySelector< HTMLElement >( '[data-lienzo-root]' ) ?? body;
	const config = window.lienzoConfig;

	let editor: EditorInstance | null = null;
	let releaseDrop: ( () => void ) | null = null;

	// Bumped whenever the root is taken over, so a picker fetch that resolves later
	// knows it is writing into someone else's element.
	let session = 0;

	const open = ( attachmentId: number, origin: PostOrigin | null = null ) => {
		session++;
		editor?.destroy();
		root.replaceChildren();

		// The shell covers the body with a spinner until it is told the content is
		// ready. It does that automatically for a render callback that returns a
		// promise -- but this one returns a teardown function synchronously while the
		// editor loads in the background, so without saying so the spinner stays up
		// over a working editor and dims the whole window.
		ctx?.markLoading?.();

		editor = mount( root, {
			attachmentId,
			host: 'window',
			...( origin ? { origin } : {} ),
			onSave: ( result ) => {
				attachDragOut( root, result );
				// The peek should show what the window shows, and after a save that is
				// the copy that was just written.
				state().previewUrl = result.url;
			},
			onReady: ( payload ) => {
				state().previewUrl = payload?.url ?? '';
				state().previewTitle = payload?.title ?? '';
				ctx?.markReady?.();
			},
		} );
	};

	state().openers.add( open );

	const attachmentId = takePending();
	// Always consumed, even with no pending id: a stale origin left parked would make
	// the next image opened from the picker offer to update someone else's product.
	const pendingOrigin = takePendingOrigin();

	if ( attachmentId ) {
		open( attachmentId, pendingOrigin );
	} else if ( config ) {
		// No file was double-clicked, so the window opened from the dock or an icon.
		// Show the picker, but intercept its links -- following one would navigate
		// the whole shell away from the desktop.
		const mine = session;

		void renderPicker(
			root,
			config,
			( id ) => open( id ),
			() => session !== mine
		);
	}

	// Guarded because it is an enhancement, not the feature. Drag-and-drop failing
	// should cost drag-and-drop; an exception here happens *inside* the shell's render
	// callback, so it takes the whole window with it and the editor never appears --
	// which is exactly what an unbound call to the shell's own method did.
	// An empty window has nothing to combine a dropped photo with, so there a drop
	// opens it; once an editor is running, a drop adds a layer.
	const drop = ( dropped: DroppedImage ) => {
		if ( editor ) {
			void editor.addImageLayer( dropped );
		} else if ( dropped.attachmentId ) {
			open( dropped.attachmentId );
		}
	};

	try {
		releaseDrop = registerDropTarget( root, drop );
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.warn( '[lienzo] drag-and-drop unavailable:', error );
	}

	const releaseFiles = attachFileDrop( root, drop );

	return () => {
		releaseFiles();
		// Only this render's own loader, so a teardown arriving after a newer render
		// cannot leave the live window unreachable.
		state().openers.delete( open );
		state().previewUrl = '';
		state().previewTitle = '';
		releaseDrop?.();
		editor?.destroy();
	};
}

// Registered here, at module scope, so the callback exists the instant this bundle
// parses -- before the shell gets round to restoring last session's windows.
registerNativeWindow();
