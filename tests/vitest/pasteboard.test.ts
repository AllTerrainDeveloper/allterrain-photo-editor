/**
 * Panning the pasteboard: the swipe, the wheel zoom, Space-drag, and keeping the
 * browser's swipe-to-go-back out of it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPasteboard } from '../../src/editor/pasteboard';

/**
 * Dispatches a pointer event. jsdom has no PointerEvent, and the handlers only read
 * what a MouseEvent already carries.
 *
 * @param target Where to dispatch.
 * @param type   Event type.
 * @param x      clientX.
 * @param y      clientY.
 */
function pointer( target: EventTarget, type: string, x: number, y: number ): MouseEvent {
	const event = new MouseEvent( type, {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		button: 0,
	} );

	target.dispatchEvent( event );

	return event;
}

/**
 * Dispatches a Space key event at the document.
 *
 * @param type keydown or keyup.
 */
function space( type: 'keydown' | 'keyup' ): KeyboardEvent {
	const event = new KeyboardEvent( type, {
		key: ' ',
		code: 'Space',
		bubbles: true,
		cancelable: true,
	} );

	document.body.dispatchEvent( event );

	return event;
}

/**
 * Gives an element the scroll geometry jsdom does not lay out: a 1000px runway in a
 * 100px viewport, with scroll positions that can be set and read back.
 *
 * @param el Element to fake.
 */
function fakeScroller( el: HTMLElement ): void {
	let left = 0;
	let top = 0;

	Object.defineProperties( el, {
		scrollWidth: { value: 1000 },
		scrollHeight: { value: 1000 },
		clientWidth: { value: 100 },
		clientHeight: { value: 100 },
		scrollLeft: { get: () => left, set: ( v: number ) => ( left = v ) },
		scrollTop: { get: () => top, set: ( v: number ) => ( top = v ) },
	} );
}

describe( 'attachPasteboard', () => {
	let pasteboard: HTMLElement;
	let stage: HTMLElement;
	let view: { pan: ReturnType< typeof vi.fn >; zoomAt: ReturnType< typeof vi.fn > };
	let detach: () => void;
	let hovered: boolean;

	beforeEach( () => {
		pasteboard = document.createElement( 'div' );
		fakeScroller( pasteboard );
		stage = document.createElement( 'div' );
		pasteboard.appendChild( stage );
		document.body.appendChild( pasteboard );
		hovered = true;

		// jsdom never matches :hover, so the pointer's whereabouts are stubbed.
		const matches = stage.matches.bind( stage );
		stage.matches = ( selector: string ) =>
			':hover' === selector ? hovered : matches( selector );

		view = { pan: vi.fn(), zoomAt: vi.fn() };
		detach = attachPasteboard( pasteboard, stage, () => view );
	} );

	afterEach( () => {
		detach();
		pasteboard.remove();
	} );

	it( 'starts in the middle of the runway', () => {
		expect( pasteboard.scrollLeft ).toBe( 450 );
		expect( pasteboard.scrollTop ).toBe( 450 );
	} );

	it( 'leaves a plain wheel to the browser, so the swipe scrolls something', () => {
		const event = new WheelEvent( 'wheel', { deltaX: 40, cancelable: true } );

		stage.dispatchEvent( event );

		expect( event.defaultPrevented ).toBe( false );
		expect( view.pan ).not.toHaveBeenCalled();
	} );

	it( 'pans by however far the pasteboard scrolled', () => {
		pasteboard.scrollLeft = 490;
		pasteboard.scrollTop = 440;
		pasteboard.dispatchEvent( new Event( 'scroll' ) );

		expect( view.pan ).toHaveBeenCalledWith( -40, 10 );
	} );

	it( 'goes back to the middle when a swipe settles, without panning back', () => {
		pasteboard.scrollLeft = 490;
		pasteboard.dispatchEvent( new Event( 'scroll' ) );
		pasteboard.dispatchEvent( new Event( 'scrollend' ) );

		expect( pasteboard.scrollLeft ).toBe( 450 );

		// The re-centre's own scroll event.
		pasteboard.dispatchEvent( new Event( 'scroll' ) );

		expect( view.pan ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'goes back to the middle before a long swipe can reach an edge', () => {
		pasteboard.scrollLeft = 800;
		pasteboard.dispatchEvent( new Event( 'scroll' ) );

		expect( view.pan ).toHaveBeenCalledWith( -350, -0 );
		expect( pasteboard.scrollLeft ).toBe( 450 );
	} );

	it( 'zooms on a Ctrl or Cmd wheel, and keeps it from the browser', () => {
		const event = new WheelEvent( 'wheel', {
			deltaY: -120,
			ctrlKey: true,
			cancelable: true,
		} );

		stage.dispatchEvent( event );

		expect( event.defaultPrevented ).toBe( true );
		expect( view.zoomAt ).toHaveBeenCalled();
		expect( view.pan ).not.toHaveBeenCalled();
	} );

	it( 'opts the page out of swipe navigation while an editor is open', () => {
		expect( document.documentElement.classList.contains( 'lz-has-editor' ) ).toBe( true );

		detach();

		expect( document.documentElement.classList.contains( 'lz-has-editor' ) ).toBe( false );
	} );

	it( 'keeps the opt-out until the last of several editors closes', () => {
		const other = attachPasteboard(
			document.createElement( 'div' ),
			document.createElement( 'div' ),
			() => view
		);

		detach();
		expect( document.documentElement.classList.contains( 'lz-has-editor' ) ).toBe( true );

		other();
		expect( document.documentElement.classList.contains( 'lz-has-editor' ) ).toBe( false );
	} );

	it( 'drags the view while Space is held, ahead of the active tool', () => {
		const tool = vi.fn();

		stage.addEventListener( 'pointerdown', tool );

		expect( space( 'keydown' ).defaultPrevented ).toBe( true );
		expect( stage.classList.contains( 'is-space-panning' ) ).toBe( true );

		pointer( stage, 'pointerdown', 100, 100 );
		pointer( window, 'pointermove', 130, 90 );
		pointer( window, 'pointerup', 130, 90 );

		expect( tool ).not.toHaveBeenCalled();
		expect( view.pan ).toHaveBeenCalledWith( 30, -10 );
	} );

	it( 'hands the tool back when Space is released', () => {
		const tool = vi.fn();

		stage.addEventListener( 'pointerdown', tool );

		space( 'keydown' );
		space( 'keyup' );

		expect( stage.classList.contains( 'is-space-panning' ) ).toBe( false );

		pointer( stage, 'pointerdown', 100, 100 );

		expect( tool ).toHaveBeenCalled();
	} );

	it( 'leaves Space alone while the pointer is off the stage', () => {
		hovered = false;

		expect( space( 'keydown' ).defaultPrevented ).toBe( false );
		expect( stage.classList.contains( 'is-space-panning' ) ).toBe( false );
	} );

	it( 'leaves Space alone in a text field', () => {
		const input = document.createElement( 'input' );

		document.body.appendChild( input );

		const event = new KeyboardEvent( 'keydown', {
			key: ' ',
			code: 'Space',
			bubbles: true,
			cancelable: true,
		} );

		input.dispatchEvent( event );

		expect( event.defaultPrevented ).toBe( false );
		expect( stage.classList.contains( 'is-space-panning' ) ).toBe( false );

		input.remove();
	} );

	it( 'lets go of Space when the window loses focus', () => {
		space( 'keydown' );
		window.dispatchEvent( new Event( 'blur' ) );

		expect( stage.classList.contains( 'is-space-panning' ) ).toBe( false );
	} );
} );
