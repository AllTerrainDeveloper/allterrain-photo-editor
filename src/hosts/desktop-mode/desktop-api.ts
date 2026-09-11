/**
 * The shell API, as AllTerrain Photo Editor uses it.
 *
 * These types are hand-written on purpose. Taking the `desktop-mode` npm package as a
 * dependency would mean AllTerrain Photo Editor could not build with OpenStation absent from disk, and
 * a standalone plugin has to.
 *
 * Everything here is feature-detected. This module also loads on plain WordPress admin
 * screens where none of these APIs exist, so every reader must return undefined rather
 * than throw.
 */

import type { PostOrigin } from '../../types';

/** Window id registered by `lienzo_register_desktop_window()`. */
export const WINDOW_ID = 'lienzo';

/** The surface this module uses, under whichever name the shell publishes. */
/**
 * The parts of the shell's native render context this file uses.
 *
 * Declared here rather than imported: AllTerrain Photo Editor builds without OpenStation present on
 * disk, so its types are described narrowly at the point of use.
 */
export interface NativeRenderContext {
	/** Puts the window body back into its loading state. */
	markLoading?: () => void;
	/** Tells the shell the body is ready, which hides the spinner. */
	markReady?: () => void;
}

export interface DesktopApi {
	isActive?: () => boolean;
	/** Runs a callback once the shell has finished booting. */
	whenReady?: ( callback: () => void ) => void;
	openWindow?: ( id: string, opts?: { source?: string } ) => boolean;
	files?: {
		rest?: {
			/** Resolve desktop storage into a Media Library attachment at drop time. */
			addUploadToMediaLibrary?: ( fileId: number ) => Promise< {
				attachmentId: number;
				title: string;
			} >;
		};
		registerOpener?: ( def: {
			id: string;
			label: string;
			types: string[];
			isDefault?: boolean;
			sort?: number;
			handler: { kind: 'js'; open: ( file: DesktopFileLike ) => void };
		} ) => void;
		/**
		 * Opts a payload type into a wallpaper tile the handler recognises.
		 *
		 * Every non-folder tile carries a claimant that hard-rejects foreign payloads,
		 * so a drop cannot fall through to the wallpaper underneath. The drop registry
		 * allows one target per element and the claimant is installed after
		 * `tile-rendered` fires, so registering a target on the tile directly is
		 * silently displaced. This is the seam that cooperates with it instead.
		 */
		registerTilePayloadHandler?: (
			type: string,
			handler: TilePayloadHandler
		) => () => void;
	};
	dragManager?: {
		registerDropTarget?: ( target: {
			id: string;
			element: HTMLElement;
			accept: ( payload: DragPayloadLike ) => boolean;
			onDrop: (
				session: { payload: DragPayloadLike },
				at: { clientX: number; clientY: number }
			) => void | Promise< void >;
			acceptLabel?: string;
		} ) => () => void;
	};
	dragBridge?: {
		getPayload?: () => Record< string, unknown > | null;
		start?: ( payload: Record< string, unknown > ) => void;
		end?: () => void;
	};
}

/** A file on the OpenStation desktop. */
export interface DesktopFileLike {
	ref: () => string;
	type?: () => string;
}

/** An OpenStation drag payload. */
export interface DragPayloadLike {
	type: string;
	data?: Record< string, unknown >;
}

/** The wallpaper tile under the cursor, as the payload handler sees it. */
export interface TilePayloadContext {
	placement: {
		file?: {
			/** The id passed to `desktop_mode_register_icon()`. */
			ref?: string;
			type?: string;
			title?: string;
		};
	};
}

/**
 * A handler that opts one payload type into one kind of tile.
 *
 * Several handlers may share a payload type, and the first whose `appliesTo`
 * matches wins -- so the predicate has to be narrow enough to name only our own
 * icon. A handler that accepted every placement would shadow every handler
 * registered after it.
 */
export interface TilePayloadHandler {
	appliesTo: ( ctx: TilePayloadContext ) => boolean;
	accept: ( data: Record< string, unknown >, ctx: TilePayloadContext ) => boolean;
	/** Shown next to the cursor while a matching payload hovers the tile. */
	acceptLabel: string;
	onDrop: (
		session: { payload: DragPayloadLike },
		at: { clientX: number; clientY: number },
		ctx: TilePayloadContext
	) => void;
}

/**
 * The OpenStation API object, whether or not the shell reports itself mounted yet.
 *
 * Separate from `desktop()` because of the order things load in: this bundle can be
 * parsed before the shell has finished booting, and `whenReady()` -- the shell's own
 * answer to exactly that -- lives on an object that is already there while
 * `isActive()` still says no. Asking through `desktop()` for it would be asking the
 * not-yet-ready shell whether it is ready.
 */
export function shellApi(): DesktopApi | undefined {
	// `os` is the current name and `desktop` the one it had before the rename. Both
	// are read, current first, because AllTerrain Photo Editor ships to sites running either version.
	const wp = window.wp as
		| { os?: DesktopApi; desktop?: DesktopApi }
		| undefined;

	return wp?.os ?? wp?.desktop;
}

/** Returns the OpenStation API when the shell is actually mounted. */
export function desktop(): DesktopApi | undefined {
	const api = shellApi();

	return api?.isActive?.() ? api : undefined;
}


/** Consumes the pending attachment id, if any. */
export function takePending(): number {
	const shared = state();
	const id = shared.pending;

	shared.pending = 0;

	return id;
}

/**
 * Consumes the post the pending attachment came from, if any.
 *
 * Read separately from the id rather than returned with it, because a window that
 * renders with no pending id still has to clear a stale origin -- otherwise the next
 * image opened from the picker would offer to update someone else's product.
 */
export function takePendingOrigin(): PostOrigin | null {
	const shared = state();
	const origin = shared.pendingOrigin;

	shared.pendingOrigin = null;

	return origin;
}

/**
 * State shared by every copy of this bundle on the page.
 *
 * There is more than one. WordPress enqueues the script, and the shell's lazy-load
 * payload injects the same URL again when a native window first opens -- so the IIFE
 * is evaluated twice and there are two module scopes. Module-level variables are then
 * two variables: `window.lienzo` belongs to whichever copy ran last, the render
 * callback to whichever registered last, and a request to open an image reached a set
 * of window loaders that the live window had never been added to. It reported success
 * and did nothing.
 *
 * Hanging the mutable state off one global makes the duplicate harmless. Everything
 * here is state that must be singular no matter how many times this file runs.
 */
export interface SharedState {
	/**
	 * Loaders belonging to the windows currently rendered.
	 *
	 * A window that is already open does not re-run its render callback when it is
	 * focused, so parking an id and calling `openWindow()` would focus the window and
	 * change nothing. A live loader is what lets a second request land in it.
	 *
	 * A set rather than one slot: the shell can render a window more than once, and a
	 * single slot ends up nulled by the first render's teardown arriving after the
	 * second render replaced it. Each render adds and removes only its own entry.
	 */
	openers: Set< ( attachmentId: number, origin?: PostOrigin | null ) => void >;
	/** Attachment parked for a window that has not rendered yet. */
	pending: number;
	/** The post that attachment came from, parked alongside it. */
	pendingOrigin: PostOrigin | null;
	/** Thumbnail of the image currently open, for the dock's hover-peek card. */
	previewUrl: string;
	/** Its title, for the thumbnail's alternative text. */
	previewTitle: string;
	/** Whether the peek filter has been added, so a second copy does not add it twice. */
	peekRegistered: boolean;
	/** Whether the cross-frame open listener is installed. */
	listenerRegistered: boolean;
	/** Whether the icon's drop handlers are installed. */
	iconDropRegistered: boolean;
}

/** Reads the shared state, creating it on first use. */
export function state(): SharedState {
	const holder = window as unknown as { __lienzoDesktop?: SharedState };

	holder.__lienzoDesktop ??= {
		openers: new Set(),
		pending: 0,
		pendingOrigin: null,
		previewUrl: '',
		previewTitle: '',
		peekRegistered: false,
		listenerRegistered: false,
		iconDropRegistered: false,
	};

	return holder.__lienzoDesktop;
}
