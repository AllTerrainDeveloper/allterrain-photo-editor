import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextEditor } from '../../src/ui/text-editor';
import type { TextEditorOptions } from '../../src/ui/text-editor';

let editor: TextEditor | null = null;

/**
 * Builds an editor over a detached stage.
 *
 * @param onCommit Called when text is finished.
 */
function makeEditor( onCommit: TextEditorOptions[ 'onCommit' ] ): {
	editor: TextEditor;
	stage: HTMLElement;
} {
	const stage = document.createElement( 'div' );

	document.body.appendChild( stage );

	editor = new TextEditor( {
		stage,
		getViewport: () => ( { x: 0, y: 0, width: 200, height: 100 } ),
		getCanvas: () => ( { width: 200, height: 100 } ),
		getStyle: () => ( {
			size: 16,
			family: 'sans-serif',
			colour: '#000000',
			bold: false,
			italic: false,
		} ),
		onCommit,
	} );

	return { editor, stage };
}

/**
 * The one field on the stage, if there is one.
 *
 * @param stage Stage element.
 */
function field( stage: HTMLElement ): HTMLTextAreaElement | null {
	return stage.querySelector( 'textarea' );
}

afterEach( () => {
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
} );

describe( 'TextEditor.place', () => {
	it( 'opens a caret when nothing is being typed', () => {
		const { editor: text, stage } = makeEditor( () => {} );

		text.place( { x: 10, y: 20 } );

		expect( text.isEditing ).toBe( true );
		expect( field( stage ) ).not.toBeNull();
	} );

	it( 'finishes the text without starting another one', () => {
		const onCommit = vi.fn();
		const { editor: text, stage } = makeEditor( onCommit );

		text.place( { x: 10, y: 20 } );
		field( stage )!.value = 'Hello';

		text.place( { x: 90, y: 60 } );

		expect( onCommit ).toHaveBeenCalledTimes( 1 );
		expect( onCommit ).toHaveBeenCalledWith( 'Hello', { x: 10, y: 20 }, null );
		expect( text.isEditing ).toBe( false );
		expect( field( stage ) ).toBeNull();
	} );

	it( 'starts a new caret on the press after that', () => {
		const onCommit = vi.fn();
		const { editor: text, stage } = makeEditor( onCommit );

		text.place( { x: 10, y: 20 } );
		field( stage )!.value = 'Hello';
		text.place( { x: 90, y: 60 } );

		text.place( { x: 90, y: 60 } );
		field( stage )!.value = 'World';
		text.place( { x: 0, y: 0 } );

		expect( onCommit ).toHaveBeenCalledTimes( 2 );
		expect( onCommit ).toHaveBeenLastCalledWith( 'World', { x: 90, y: 60 }, null );
	} );

	it( 'commits nothing when the caret was left empty', () => {
		const onCommit = vi.fn();
		const { editor: text } = makeEditor( onCommit );

		text.place( { x: 10, y: 20 } );
		text.place( { x: 90, y: 60 } );

		expect( onCommit ).not.toHaveBeenCalled();
		expect( text.isEditing ).toBe( false );
	} );

	it( 'keeps nothing after Escape', () => {
		const onCommit = vi.fn();
		const { editor: text, stage } = makeEditor( onCommit );

		text.place( { x: 10, y: 20 } );
		field( stage )!.value = 'Hello';
		text.cancel();

		expect( onCommit ).not.toHaveBeenCalled();
		expect( field( stage ) ).toBeNull();
	} );
} );

describe( 'TextEditor and the editor chrome', () => {
	/**
	 * An editor whose options bar is a sibling of the stage.
	 *
	 * @param onCommit Called when text is finished.
	 */
	function withChrome( onCommit: TextEditorOptions[ 'onCommit' ] ) {
		const stage = document.createElement( 'div' );
		const bar = document.createElement( 'div' );
		const swatch = document.createElement( 'input' );

		swatch.type = 'color';
		bar.appendChild( swatch );
		document.body.append( stage, bar );

		editor = new TextEditor( {
			stage,
			chrome: [ bar ],
			getViewport: () => ( { x: 0, y: 0, width: 200, height: 100 } ),
			getCanvas: () => ( { width: 200, height: 100 } ),
			getStyle: () => ( {
				size: 16,
				family: 'sans-serif',
				colour: '#000000',
				bold: false,
				italic: false,
			} ),
			onCommit,
		} );

		return { editor, stage, bar, swatch };
	}

	it( 'keeps the caret open when a control in the options bar takes focus', () => {
		const onCommit = vi.fn();
		const { editor: text, stage, swatch } = withChrome( onCommit );

		text.open( { x: 10, y: 20 } );
		field( stage )!.value = 'Hello';

		field( stage )!.dispatchEvent(
			new FocusEvent( 'blur', { relatedTarget: swatch } )
		);

		expect( onCommit ).not.toHaveBeenCalled();
		expect( text.isEditing ).toBe( true );
	} );

	it( 'keeps the caret open across a press on chrome that cannot take focus', () => {
		const onCommit = vi.fn();
		const { editor: text, stage, bar } = withChrome( onCommit );

		text.open( { x: 10, y: 20 } );

		// A label or the bar's background: focus goes nowhere, so the blur names no
		// related target. The press itself is what says "this is about the text".
		bar.dispatchEvent( new Event( 'pointerdown', { bubbles: true } ) );
		field( stage )!.dispatchEvent( new FocusEvent( 'blur', { relatedTarget: null } ) );

		expect( text.isEditing ).toBe( true );

		window.dispatchEvent( new Event( 'pointerup' ) );
		field( stage )!.value = 'Later';
		field( stage )!.dispatchEvent( new FocusEvent( 'blur', { relatedTarget: null } ) );

		expect( onCommit ).toHaveBeenCalledWith( 'Later', { x: 10, y: 20 }, null );
	} );

	it( 'still commits when focus leaves for anywhere else', () => {
		const onCommit = vi.fn();
		const { editor: text, stage } = withChrome( onCommit );
		const elsewhere = document.createElement( 'button' );

		document.body.appendChild( elsewhere );
		text.open( { x: 10, y: 20 } );
		field( stage )!.value = 'Done';

		field( stage )!.dispatchEvent(
			new FocusEvent( 'blur', { relatedTarget: elsewhere } )
		);

		expect( onCommit ).toHaveBeenCalledTimes( 1 );
		expect( text.isEditing ).toBe( false );
	} );
} );
