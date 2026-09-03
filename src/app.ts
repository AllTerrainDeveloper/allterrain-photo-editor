/**
 * The editor's window, as an OpenStation App Framework client view.
 *
 * The window itself is declared in PHP -- `apps/photo-editor/photo-editor.os.php`
 * says what it is called, how big it opens and who may open it -- and the framework's
 * shared runtime mounts it. This file is the body: a root for the editor, and the
 * moment the runtime has painted it, a hand-off to the main bundle, which fills the
 * root exactly as it fills a directly registered window.
 *
 * A bundle of its own because an IIFE has one entry and this cannot be the main one:
 * the framework loads a window's client view the first time the window opens, while
 * the main bundle is on every shell page already -- it answers the media modal, the
 * file opener and the icon drop before any window exists. Loading it a second time
 * for the window would cost every open a few hundred kilobytes of parse.
 *
 * Written against the runtime's queue rather than importing `@openstation/app`: a
 * plugin outside the OpenStation repository cannot import from it, and the queue is
 * the seam the framework publishes for exactly that. The same snippet works whether
 * this script ran before or after the runtime.
 */

import type { NativeRenderContext } from './hosts/desktop-mode/desktop-api';

/** Window id, matching `App::define()` in the `.os.php` and `WINDOW_ID` in the shell glue. */
const APP_ID = 'lienzo';

/** How long to wait for the main bundle before giving up on this open. */
const MAIN_BUNDLE_WAIT_MS = 5000;

/** How often to look, while waiting. */
const MAIN_BUNDLE_POLL_MS = 50;

/** The part of the runtime's client API this file uses. */
interface ClientApi {
	defineApp: (
		id: string,
		def: {
			view: ( ctx: { root: HTMLElement } ) => unknown;
			mounted?: ( ctx: { root: HTMLElement } ) => void | ( () => void );
		}
	) => unknown;
	html: ( strings: TemplateStringsArray, ...values: unknown[] ) => unknown;
}

/** The queue the runtime drains, or the live object it becomes once loaded. */
type PendingQueue =
	| Array< ( api: ClientApi ) => void >
	| { push: ( fn: ( api: ClientApi ) => void ) => void };

interface AppGlobals {
	openStationAppsPending?: PendingQueue;
	lienzo?: {
		renderDesktopWindow?: (
			body: HTMLElement,
			ctx?: NativeRenderContext
		) => () => void;
	};
}

const globals = window as unknown as AppGlobals;

/**
 * Fills the root with the editor once the main bundle is there to do it.
 *
 * It nearly always is: the main bundle is enqueued on every shell page. The wait
 * covers a shell that loads the window's companions before the page's own scripts
 * have finished, and gives up rather than polling forever on a page where the main
 * bundle failed to load at all.
 *
 * @param root The client view's mount root.
 * @return Teardown, run by the runtime on close.
 */
function mountEditor( root: HTMLElement ): () => void {
	let teardown: ( () => void ) | null = null;
	let waited = 0;
	let timer = 0;

	const attempt = (): boolean => {
		const render = globals.lienzo?.renderDesktopWindow;

		if ( ! render ) {
			return false;
		}

		teardown = render( root );

		return true;
	};

	if ( ! attempt() ) {
		timer = window.setInterval( () => {
			waited += MAIN_BUNDLE_POLL_MS;

			if ( attempt() || waited >= MAIN_BUNDLE_WAIT_MS ) {
				window.clearInterval( timer );
			}
		}, MAIN_BUNDLE_POLL_MS );
	}

	return () => {
		window.clearInterval( timer );
		teardown?.();
	};
}

( globals.openStationAppsPending ??= [] ).push( ( { defineApp, html } ) =>
	defineApp( APP_ID, {
		// The same root the directly registered window's template carries, so the
		// main bundle finds its mount point the same way on both paths.
		view: () =>
			html`<div class="lienzo-root" data-lienzo-root data-host="window"></div>`,
		mounted: ( ctx ) => mountEditor( ctx.root ),
	} )
);
