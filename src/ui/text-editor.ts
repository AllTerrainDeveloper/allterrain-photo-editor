/**
 * On-canvas text editing.
 *
 * Typing into a field in the toolbar and then clicking to stamp the result is not how
 * anyone thinks about text: you cannot see it against the image, you cannot tell how
 * big it is, and every correction means going back up to the toolbar. So the caret
 * goes where the text goes.
 *
 * Clicking with the Text tool opens a transparent `<textarea>` sitting exactly where
 * the glyphs will land, styled with the same font, size and colour the render will
 * use, and scaled to the current zoom. What you type is what appears. Committing
 * rasterises it through the same `textCanvas()` the tool always used, so the editing
 * surface and the output cannot drift apart -- they share the measurement code.
 *
 * The same caret reopens over text that has already been committed. A text layer
 * remembers its words, so clicking it with the Text tool puts the field back where
 * the glyphs are, filled with what they say, and committing swaps the rendering for
 * a new one. That is the difference between text as an object and text as paint.
 *
 * A textarea rather than a contenteditable div: it gives a native caret, native
 * selection, native undo within the field and plain text on paste, none of which are
 * worth reimplementing.
 */

import { cssFont } from '../engine/paint-shapes';
import type { CanvasSize } from '../model/document';

/** How the text is drawn. Mirrors the fields `textCanvas()` reads. */
export interface TextStyle {
	size: number;
	family: string;
	colour: string;
	bold: boolean;
	italic: boolean;
}

/** What opening the caret over existing text needs to know. */
export interface TextOpenOptions {
	/** Words to start with. Empty for a fresh caret. */
	initial?: string;
	/** The layer being retyped, when the caret is over one. */
	layerId?: string;
	/**
	 * The layer's transform scale, so the caret is the size the glyphs are drawn at.
	 *
	 * The type size is defined against the layer's own bitmap, and the layer may have
	 * been scaled since; a caret at the unscaled size would sit inside text twice as
	 * big as itself.
	 */
	scale?: { x: number; y: number };
}

export interface TextEditorOptions {
	/** The canvas area the editor floats over. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Canvas size in its own pixels. */
	getCanvas: () => CanvasSize;
	/** Current text style. */
	getStyle: () => TextStyle;
	/**
	 * Called when the text is finished.
	 *
	 * @param text    What was typed. Never empty for a fresh caret; may be empty when
	 *                an existing layer was retyped, which means "remove it".
	 * @param point   Where the glyphs' top-left corner sits, in canvas pixels.
	 * @param layerId The layer being retyped, or null for new text.
	 */
	onCommit: (
		text: string,
		point: { x: number; y: number },
		layerId: string | null
	) => void;
	/** Called when editing starts or stops, so the toolbar can follow. */
	onStateChange?: () => void;
	/**
	 * Elements whose controls restyle the text rather than finish it.
	 *
	 * The options bar and the sidebar. Clicking a colour swatch, a font menu or the
	 * Bold checkbox takes focus off the caret, and a caret that committed on every
	 * blur was gone before the colour could be chosen -- the tool switched, the bar
	 * changed underneath the click, and the text could not be restyled at all.
	 */
	chrome?: HTMLElement[];
}

/**
 * A text caret on the canvas.
 */
export class TextEditor {
	private options: TextEditorOptions;

	private field: HTMLTextAreaElement | null = null;

	/** Where the text begins, in canvas pixels. */
	private anchor: { x: number; y: number } | null = null;

	/** The layer whose words are being retyped, if any. */
	private layerId: string | null = null;

	/** The scale the caret is drawn at, from the layer being retyped. */
	private scale = { x: 1, y: 1 };

	/**
	 * Whether a press on the editor's own chrome is under way.
	 *
	 * Set on the press and cleared on the release, because the blur it causes arrives
	 * with no `relatedTarget` when the thing pressed cannot take focus -- a label, the
	 * bar's own background -- and the caret has to know not to commit for it anyway.
	 */
	private pressingChrome = false;

	/** Listeners on the chrome, removed when the caret closes. */
	private detachChrome: Array< () => void > = [];

	constructor( options: TextEditorOptions ) {
		this.options = options;
	}

	/** Whether something is being typed right now. */
	get isEditing(): boolean {
		return this.field !== null;
	}

	/** The layer being retyped, or null when the caret is over new text or closed. */
	get editingLayerId(): string | null {
		return this.field ? this.layerId : null;
	}

	/**
	 * What a press on the canvas means while the text tool is active.
	 *
	 * One press does one thing. Clicking away from a caret finishes the text and stops
	 * there -- it does not also start the next one, because "I am done writing this" and
	 * "here is where the next paragraph goes" are two different intentions and a single
	 * click cannot be both. Typing then clicking away would otherwise leave an empty
	 * caret sitting wherever you happened to click to get rid of the last one.
	 *
	 * Press again and, with nothing being typed, a new caret opens where you clicked.
	 *
	 * @param point Canvas coordinates for the top-left of the first line.
	 */
	place( point: { x: number; y: number } ): void {
		if ( this.isEditing ) {
			this.commit();

			return;
		}

		this.open( point );
	}

	/**
	 * Opens a caret at a point on the canvas.
	 *
	 * Anything already being typed is committed first, so no caller can end up with two
	 * carets open at once.
	 *
	 * @param point   Canvas coordinates for the top-left of the first line.
	 * @param options Optional. Existing words to start from, and the layer they belong to.
	 */
	open( point: { x: number; y: number }, options: TextOpenOptions = {} ): void {
		this.commit();

		const field = document.createElement( 'textarea' );

		field.className = 'lz-text-editor';
		field.rows = 1;
		field.spellcheck = false;
		field.setAttribute( 'aria-label', 'Text' );
		field.value = options.initial ?? '';

		// The stage listens for pointerdown to place text; without this, clicking into
		// what you are already typing would commit it and start again one character in.
		field.addEventListener( 'pointerdown', ( event ) => event.stopPropagation() );
		field.addEventListener( 'input', this.onInput );
		field.addEventListener( 'keydown', this.onKeyDown );
		// Clicking away is a commit, the same as it is in a spreadsheet cell -- unless
		// "away" is the options bar, where the click is about this text.
		field.addEventListener( 'blur', this.onBlur );
		this.watchChrome();

		this.anchor = point;
		this.layerId = options.layerId ?? null;
		this.scale = options.scale ?? { x: 1, y: 1 };
		this.field = field;
		this.options.stage.appendChild( field );

		this.restyle();
		field.focus();

		// The caret goes to the end, where a correction or a continuation both start.
		field.setSelectionRange( field.value.length, field.value.length );

		this.options.onStateChange?.();
	}

	/** Grows the field to fit what has been typed. */
	private onInput = (): void => {
		this.resize();
	};

	/**
	 * Finishes the text when focus genuinely leaves it.
	 *
	 * Focus moving onto the editor's own chrome does not count: the colour swatch, the
	 * font menu and the weight toggles exist to restyle what is being typed, and every
	 * one of them takes focus to work. The caret stays, restyles live, and is one click
	 * away from typing again.
	 *
	 * @param event Focus event.
	 */
	private onBlur = ( event: FocusEvent ): void => {
		if ( this.pressingChrome || this.isChrome( event.relatedTarget ) ) {
			return;
		}

		this.commit();
	};

	/**
	 * Whether an element belongs to the chrome that restyles rather than finishes.
	 *
	 * @param target What received focus.
	 */
	private isChrome( target: EventTarget | null ): boolean {
		return (
			target instanceof Node &&
			( this.options.chrome ?? [] ).some( ( host ) => host.contains( target ) )
		);
	}

	/** Notices presses on the chrome, so a blur they cause is not a commit. */
	private watchChrome(): void {
		const down = () => {
			this.pressingChrome = true;
		};
		const up = () => {
			this.pressingChrome = false;
		};

		for ( const host of this.options.chrome ?? [] ) {
			host.addEventListener( 'pointerdown', down, true );
			this.detachChrome.push( () =>
				host.removeEventListener( 'pointerdown', down, true )
			);
		}

		window.addEventListener( 'pointerup', up, true );
		window.addEventListener( 'pointercancel', up, true );
		this.detachChrome.push( () => {
			window.removeEventListener( 'pointerup', up, true );
			window.removeEventListener( 'pointercancel', up, true );
		} );
	}

	/**
	 * Handles the keys that finish or abandon the text.
	 *
	 * @param event Key event.
	 */
	private onKeyDown = ( event: KeyboardEvent ): void => {
		// Kept from reaching the editor's own shortcuts: a plain letter here is a
		// letter, not a tool switch, and Escape means "abandon this" rather than
		// "deselect".
		event.stopPropagation();

		if ( event.key === 'Escape' ) {
			event.preventDefault();
			this.cancel();

			return;
		}

		// Enter inserts a line break, because text is often more than one line. The
		// modifier commits, matching every other multi-line field in the admin.
		if ( event.key === 'Enter' && ( event.metaKey || event.ctrlKey ) ) {
			event.preventDefault();
			this.commit();
		}
	};

	/** Applies the current style and position to the field. */
	restyle = (): void => {
		const field = this.field;
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! field || ! this.anchor || ! viewport || canvas.width < 1 ) {
			return;
		}

		const style = this.options.getStyle();
		// Canvas pixels to screen pixels: the type size is defined against the image, so
		// the caret has to grow and shrink with the zoom or it would lie about the size.
		// The layer's own scale rides along for the same reason.
		const zoom = viewport.width / canvas.width;

		field.style.font = cssFont( {
			text: '',
			size: Math.max( 1, style.size * zoom * this.scale.x ),
			family: style.family,
			colour: style.colour,
			bold: style.bold,
			italic: style.italic,
		} );
		field.style.lineHeight = '1.25';
		field.style.color = style.colour;
		field.style.insetInlineStart = `${
			viewport.x + ( this.anchor.x / canvas.width ) * viewport.width
		}px`;
		field.style.insetBlockStart = `${
			viewport.y + ( this.anchor.y / canvas.height ) * viewport.height
		}px`;

		this.resize();
	};

	/** Sizes the field to its contents, in both directions. */
	private resize(): void {
		const field = this.field;

		if ( ! field ) {
			return;
		}

		// Measured rather than guessed: a textarea does not size itself, and a fixed
		// width would either clip long lines or leave a box far wider than the text.
		field.style.blockSize = 'auto';
		field.style.inlineSize = '0';
		field.style.inlineSize = `${ field.scrollWidth + 4 }px`;
		field.style.blockSize = `${ field.scrollHeight }px`;
	}

	/**
	 * Rasterises what was typed and closes the caret.
	 *
	 * Over an existing layer the commit always fires, even with the field emptied:
	 * deleting every word of a text layer is how you delete the layer.
	 */
	commit(): void {
		const field = this.field;
		const anchor = this.anchor;
		const layerId = this.layerId;

		if ( ! field || ! anchor ) {
			return;
		}

		const text = field.value;

		this.close();

		if ( text.trim() || layerId ) {
			this.options.onCommit( text, anchor, layerId );
		}
	}

	/** Closes the caret, discarding what was typed. */
	cancel(): void {
		this.close();
	}

	/** Removes the field. */
	private close(): void {
		const field = this.field;

		this.field = null;
		this.anchor = null;
		this.layerId = null;
		this.scale = { x: 1, y: 1 };
		this.pressingChrome = false;

		for ( const off of this.detachChrome ) {
			off();
		}

		this.detachChrome = [];

		// Removing a focused field fires blur, which calls commit() -- harmless, because
		// the field reference is already gone and commit() returns immediately.
		field?.remove();

		this.options.onStateChange?.();
	}

	/** Removes the editor entirely. */
	destroy(): void {
		this.close();
	}
}
