/**
 * Panning and zooming the pasteboard.
 */

import { hasCommandKey, onEditorKey } from './keys';

/** What the pasteboard needs from the renderer. */
export interface PasteboardView {
	pan: ( dx: number, dy: number ) => void;
	zoomAt: ( factor: number, originX: number, originY: number ) => void;
}

/**
 * How many editors are open, so the last one to close is the one that hands the
 * page's horizontal swipe back.
 */
let openEditors = 0;

/**
 * Lets the pasteboard be scrolled, zoomed and dragged.
 *
 * A plain wheel scrolls, which is what a trackpad or a Magic Mouse produces from
 * a two-finger swipe -- so panning is the default gesture rather than something
 * behind a modifier. Ctrl or Cmd with the wheel zooms, matching the convention
 * every map and design tool uses, and is also what a pinch gesture reports.
 *
 * The scroll is left to the browser, which scrolls the pasteboard's runway, and the
 * distance it moved is handed to the renderer as a pan. Cancelling the wheel event
 * and panning by its delta looks equivalent and is not: Chrome on a Mac then decides
 * that the swipe scrolled nothing and turns it into Back. See `EditorShell.pasteboard`.
 *
 * Zooming is still a cancelled wheel event -- the listener is non-passive for that,
 * because otherwise a pinch zooms the browser.
 *
 * Holding Space turns any tool into the hand for as long as it is held, the way it
 * does in every image editor since Photoshop.
 *
 * @param pasteboard  The scroll container around the stage.
 * @param stage       The canvas area.
 * @param getRenderer The renderer, or null before it has started.
 * @return Detach function.
 */
export function attachPasteboard(
	pasteboard: HTMLElement,
	stage: HTMLElement,
	getRenderer: () => PasteboardView | null
): () => void {
	const onWheel = ( event: WheelEvent ) => {
		const renderer = getRenderer();

		if ( ! renderer || ! ( event.ctrlKey || event.metaKey ) ) {
			return;
		}

		event.preventDefault();

		const bounds = stage.getBoundingClientRect();

		// Exponential so zooming in and out by the same gesture is symmetrical.
		// The coefficient is tuned for a mouse wheel, where one notch reports a
		// delta of about 120: that gives roughly 1.27x per notch, which is a step
		// you can aim with. A trackpad pinch reports much smaller deltas and lands
		// proportionally finer.
		renderer.zoomAt(
			Math.exp( -event.deltaY * 0.002 ),
			event.clientX - bounds.left,
			event.clientY - bounds.top
		);
	};

	stage.addEventListener( 'wheel', onWheel, { passive: false } );

	const detachScroll = attachScrollPan( pasteboard, getRenderer );
	const detachSpace = attachSpacePan( stage, getRenderer );
	const releaseSwipe = holdHorizontalSwipe();

	return () => {
		stage.removeEventListener( 'wheel', onWheel );
		detachScroll();
		detachSpace();
		releaseSwipe();
	};
}

/**
 * Turns scrolling the pasteboard into panning the view.
 *
 * The pasteboard sits somewhere in the middle of a runway far bigger than any
 * swipe. Each scroll event pans by however far it moved, and the position is put back
 * in the middle once a swipe settles -- or sooner, should one ever get within a
 * quarter of the runway of an edge, because an edge is where the browser would start
 * treating the swipe as its own again.
 *
 * Re-centring is itself a scroll, so it moves the baseline with it and is never read
 * back as a pan.
 *
 * @param pasteboard  The scroll container.
 * @param getRenderer The renderer, or null before it has started.
 * @return Detach function.
 */
function attachScrollPan(
	pasteboard: HTMLElement,
	getRenderer: () => PasteboardView | null
): () => void {
	let last = { x: pasteboard.scrollLeft, y: pasteboard.scrollTop };

	/** Half the scrollable distance on each axis: as far from an edge as it gets. */
	const centre = () => {
		const x = ( pasteboard.scrollWidth - pasteboard.clientWidth ) / 2;
		const y = ( pasteboard.scrollHeight - pasteboard.clientHeight ) / 2;

		// Right-to-left scroll positions run from 0 at the right edge into negatives.
		const rtl = 'rtl' === getComputedStyle( pasteboard ).direction;

		return { x: rtl ? -x : x, y };
	};

	const recentre = () => {
		const middle = centre();

		pasteboard.scrollLeft = middle.x;
		pasteboard.scrollTop = middle.y;
		last = { x: pasteboard.scrollLeft, y: pasteboard.scrollTop };
	};

	const onScroll = () => {
		const now = { x: pasteboard.scrollLeft, y: pasteboard.scrollTop };
		const dx = now.x - last.x;
		const dy = now.y - last.y;

		last = now;

		if ( dx || dy ) {
			getRenderer()?.pan( -dx, -dy );
		}

		const middle = centre();

		if (
			Math.abs( now.x - middle.x ) > Math.abs( middle.x ) / 2 ||
			Math.abs( now.y - middle.y ) > Math.abs( middle.y ) / 2
		) {
			recentre();
		}
	};

	// The pasteboard's size sets where the middle is, so a resize moves it.
	const resize =
		'undefined' === typeof ResizeObserver ? null : new ResizeObserver( recentre );

	resize?.observe( pasteboard );
	pasteboard.addEventListener( 'scroll', onScroll, { passive: true } );
	pasteboard.addEventListener( 'scrollend', recentre );
	recentre();

	return () => {
		resize?.disconnect();
		pasteboard.removeEventListener( 'scroll', onScroll );
		pasteboard.removeEventListener( 'scrollend', recentre );
	};
}

/**
 * Takes the horizontal swipe away from the browser while an editor is open.
 *
 * Chrome on a Mac turns a sideways swipe -- two fingers on a trackpad, one on a
 * Magic Mouse -- into Back and Forward, and it can decide to before the page has
 * had its say on the wheel event. So `preventDefault()` alone still lets a sideways
 * pan throw the whole editor away. `overscroll-behavior-x: none` on the root is the
 * documented way to opt out of that gesture, and it costs the admin nothing: the
 * page does not scroll sideways anyway.
 *
 * Counted, because more than one editor can be open on one page in desktop mode,
 * and closing one must not hand the swipe back to the others.
 *
 * @return Release function.
 */
function holdHorizontalSwipe(): () => void {
	let held = true;

	openEditors++;
	document.documentElement.classList.add( 'lz-has-editor' );

	return () => {
		if ( ! held ) {
			return;
		}

		held = false;
		openEditors--;

		if ( openEditors < 1 ) {
			openEditors = 0;
			document.documentElement.classList.remove( 'lz-has-editor' );
		}
	};
}

/**
 * Pans the view while Space is held and the pointer drags.
 *
 * Space is only claimed while the pointer is over the stage. Away from it the key
 * still belongs to whatever has focus -- a focused button in the sidebar has to stay
 * pressable from the keyboard.
 *
 * The press is caught in the capture phase, ahead of the brush, the marquee and the
 * transform handles, so that the hand wins over whichever tool is active without any
 * of them having to know it exists.
 *
 * @param stage       The canvas area.
 * @param getRenderer The renderer, or null before it has started.
 * @return Detach function.
 */
function attachSpacePan(
	stage: HTMLElement,
	getRenderer: () => PasteboardView | null
): () => void {
	let held = false;
	let last: { x: number; y: number } | null = null;

	const isSpace = ( event: KeyboardEvent ) =>
		' ' === event.key || 'Space' === event.code;

	const endDrag = () => {
		last = null;
		stage.classList.remove( 'is-space-dragging' );
		window.removeEventListener( 'pointermove', onMove );
		window.removeEventListener( 'pointerup', endDrag );
		window.removeEventListener( 'pointercancel', endDrag );
	};

	const release = () => {
		held = false;
		stage.classList.remove( 'is-space-panning' );
		endDrag();
	};

	const onMove = ( event: PointerEvent ) => {
		const renderer = getRenderer();

		if ( ! last || ! renderer ) {
			return;
		}

		renderer.pan( event.clientX - last.x, event.clientY - last.y );
		last = { x: event.clientX, y: event.clientY };
	};

	const onPointerDown = ( event: PointerEvent ) => {
		if ( ! held || 0 !== event.button ) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		last = { x: event.clientX, y: event.clientY };
		stage.classList.add( 'is-space-dragging' );
		window.addEventListener( 'pointermove', onMove );
		window.addEventListener( 'pointerup', endDrag );
		window.addEventListener( 'pointercancel', endDrag );
	};

	const offKeyDown = onEditorKey( 'keydown', ( event ) => {
		if ( ! isSpace( event ) || hasCommandKey( event ) ) {
			return;
		}

		// Held already: swallow the auto-repeat, which would otherwise scroll the page
		// or press a focused button a dozen times a second.
		if ( held ) {
			event.preventDefault();

			return;
		}

		if ( ! stage.matches( ':hover' ) || ! getRenderer() ) {
			return;
		}

		event.preventDefault();
		held = true;
		stage.classList.add( 'is-space-panning' );
	} );

	// Not `onEditorKey`: letting go has to register wherever the focus has wandered
	// to, or the hand would stay stuck on.
	const onKeyUp = ( event: KeyboardEvent ) => {
		if ( ! held || ! isSpace( event ) ) {
			return;
		}

		event.preventDefault();
		release();
	};

	stage.addEventListener( 'pointerdown', onPointerDown, true );
	document.addEventListener( 'keyup', onKeyUp );
	window.addEventListener( 'blur', release );

	return () => {
		release();
		offKeyDown();
		stage.removeEventListener( 'pointerdown', onPointerDown, true );
		document.removeEventListener( 'keyup', onKeyUp );
		window.removeEventListener( 'blur', release );
	};
}
