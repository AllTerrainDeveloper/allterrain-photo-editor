/**
 * The OpenStation host.
 *
 * Renders the editor as a native OpenStation window -- in the parent shell's DOM
 * rather than a chromeless iframe -- and wires it into the desktop's own idioms:
 * double-clicking a photo on the wallpaper opens it here, a photo or a product can
 * be dropped onto the icon to open it, a photo can be dragged onto the window to load
 * it, and a saved result can be dragged back out into a Gutenberg window.
 *
 * Everything is feature-detected. This module also loads on plain WordPress admin
 * screens where none of these APIs exist, so every entry point must be a silent
 * no-op rather than a console error.
 */

import { desktop, shellApi } from './desktop-api';
import { registerFileOpener } from './file-opener';
import { registerIconDrop } from './icon-drop';
import { renderWindow } from './native-window';
import { listenForOpenRequests } from './open-window';
import { registerPeekThumbnail } from './peek';

/**
 * How long to keep looking for a shell that has not published itself yet.
 *
 * Only used where `whenReady()` is absent -- an older shell, or one whose API object
 * appears after this bundle runs. Bounded, because a page with no shell at all must
 * settle into doing nothing rather than polling for the rest of its life.
 */
const SHELL_WAIT_MS = 4000;

/** How often to look, while looking. */
const SHELL_POLL_MS = 100;

/**
 * Registers the native window renderer and the desktop integrations.
 *
 * Safe to call anywhere; no-ops without OpenStation.
 */
export function bootDesktopMode(): void {
	// First, and outside every guard, because it depends on nothing the shell
	// provides: it is a `message` listener that answers by calling
	// `openDesktopWindow()`, which asks the shell at the moment a message arrives
	// rather than at boot.
	//
	// It used to sit at the bottom of this function, behind `if ( ! desktop() )
	// return`. On a shell page this bundle can be parsed before the shell publishes
	// `wp.os`, and that single early return then meant no listener for the life of
	// the page -- so every request posted up from a chromeless iframe went unheard.
	// "Edit with AllTerrain Photo Editor" in the media modal, and Media -> Edit Photos, both post
	// exactly that request, and both did nothing at all.
	listenForOpenRequests();

	whenShellReady( registerShellIntegrations );
}

/**
 * Wires the integrations that genuinely need the shell to be up.
 *
 * Each is guarded on its own: a shell missing one seam should cost that seam and
 * nothing else.
 */
function registerShellIntegrations(): void {
	registerPeekThumbnail();

	try {
		registerFileOpener();
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.warn( '[lienzo] file opener unavailable:', error );
	}

	try {
		registerIconDrop();
	} catch ( error ) {
		// An enhancement, not the feature. A shell without the tile-payload seam still
		// opens AllTerrain Photo Editor from the icon by double-clicking it.
		// eslint-disable-next-line no-console
		console.warn( '[lienzo] icon drop unavailable:', error );
	}
}

/**
 * Runs a callback once the shell is mounted, or never if it never is.
 *
 * Three answers, best first: the shell is already up; the shell is on the page and
 * offers `whenReady()`, which is its own answer to a plugin that loaded first; or
 * neither, in which case we look again for a few seconds before concluding this is
 * a page with no desktop on it. Registering nothing on a plain admin screen is the
 * *correct* outcome -- the mistake was concluding it from one look.
 *
 * @param run What to register once the shell is there.
 */
function whenShellReady( run: () => void ): void {
	if ( desktop() ) {
		run();

		return;
	}

	const ready = shellApi()?.whenReady;

	if ( ready ) {
		ready( () => {
			if ( desktop() ) {
				run();
			}
		} );

		return;
	}

	let waited = 0;
	const timer = window.setInterval( () => {
		waited += SHELL_POLL_MS;

		if ( desktop() ) {
			window.clearInterval( timer );
			run();

			return;
		}

		if ( waited >= SHELL_WAIT_MS ) {
			window.clearInterval( timer );
		}
	}, SHELL_POLL_MS );
}

export { isShellPage, openDesktopWindow, openInDesktop } from './open-window';
export { renderWindow as renderDesktopWindow };
