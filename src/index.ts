/**
 * Bundle entry point.
 *
 * Publishes the API on `window.lienzo` and boots every host that might have a mount
 * point on this screen. There are two editing surfaces and one rule for choosing
 * between them: inside the desktop shell it is a native window, because that is the
 * only place the shell's Pixi, components and drag bridge are reachable, and
 * everywhere else it is the classic-admin page or an overlay over the current screen.
 * `openEditor()` is the one place that decides.
 */

import { mount } from './editor';
import type { EditorInstance, MountOptions } from './editor';
import { bootAdminPage } from './hosts/admin-page';
import { bootBlockEditor } from './hosts/block-editor';
import {
	bootDesktopMode,
	openInDesktop,
	renderDesktopWindow,
} from './hosts/desktop-mode';
import { bootMediaDrag } from './hosts/media-drag';
import { bootMediaModal } from './hosts/media-modal';
import { openEditor } from './hosts/open';
import { bootOpenButtons } from './hosts/open-buttons';
import { openEditorOverlay } from './hosts/overlay';
import { listPanels, registerPanel, unregisterPanel } from './ui/panels';
import type { PanelDef } from './ui/panels';

/**
 * The public JavaScript API, as it lands on `window.lienzo`.
 *
 * Vite builds this bundle as an IIFE named `lienzo`, which assigns the module's
 * *exports* to the global. So the exports at the foot of this file are the API --
 * there is no second object to keep in step, and an earlier one that tried to be was
 * silently overwritten on every load.
 */
export interface LienzoApi {
	mount: typeof mount;
	/**
	 * Opens an image in whichever surface this page can offer.
	 *
	 * The way in. A desktop window inside the shell, an overlay outside it -- callers
	 * should not have to know which, and every one of AllTerrain Photo Editor's own entry points goes
	 * through here.
	 */
	openEditor: typeof openEditor;
	/**
	 * Opens an image in the desktop window specifically.
	 *
	 * Returns false when there is no shell to open one in, which is what
	 * `openEditor()` uses to decide. Prefer that unless you specifically want the
	 * window and nothing else.
	 */
	openInDesktop: typeof openInDesktop;
	/** Opens an image in a full-screen overlay over the current screen. */
	openEditorOverlay: typeof openEditorOverlay;
	/**
	 * Renders the desktop window's contents into an element.
	 *
	 * What the App Framework client view (`src/app.ts`) calls once the shell has
	 * mounted the window: the picker, or the pending image, and every desktop
	 * integration the window body carries. Returns the teardown to run on close.
	 */
	renderDesktopWindow: typeof renderDesktopWindow;
	registerPanel: typeof registerPanel;
	unregisterPanel: typeof unregisterPanel;
	listPanels: typeof listPanels;
	/** Bundle version, matching the plugin's. */
	version: string;
}

declare global {
	interface Window {
		lienzo?: LienzoApi;
	}
}

/** Bundle version, matching the plugin's. */
export const version: string = window.lienzoConfig?.version ?? '0.0.0';

/** Starts every host that has a mount point on this screen. */
function boot(): void {
	bootDesktopMode();
	bootAdminPage();
	bootOpenButtons();
	bootMediaDrag();
	bootMediaModal();
	bootBlockEditor();
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', boot, { once: true } );
} else {
	boot();
}

export {
	mount,
	openEditor,
	openEditorOverlay,
	openInDesktop,
	renderDesktopWindow,
	registerPanel,
	unregisterPanel,
	listPanels,
};
export type { EditorInstance, MountOptions, PanelDef };
