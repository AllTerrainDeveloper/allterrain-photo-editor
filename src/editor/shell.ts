/**
 * The editor's static layout.
 *
 * Everything that exists before an image does: the toolbar row, the stage, the canvas
 * backdrop, the loading message and the sidebar with its reopen tab. Built once in the
 * constructor so a host can place the editor before knowing how long the image will
 * take to load.
 */

import { __ } from '../i18n';
import { isDesktopModeEnabled } from '../platform';
import { PICKER_CLASS } from '../ui/picker';
import { createSidebarToggle } from './sidebar-tab';
import type { SidebarToggle } from './sidebar-tab';

export interface ShellOptions {
	/** Element to fill. Its contents are replaced. */
	root: HTMLElement;
	/** Which surface is hosting the editor. Affects chrome only, never the engine. */
	host: 'page' | 'modal' | 'window';
	/** Called after the sidebar is shown or hidden, so the canvas can be re-fitted. */
	onSidebarToggle: () => void;
}

/**
 * The editor's chrome.
 */
export class EditorShell {
	readonly root: HTMLElement;

	/** The one bar across the top. */
	readonly topbar: HTMLElement;

	/**
	 * Where the contextual options bar goes.
	 *
	 * In the middle of the top bar rather than in a row of its own. Two rows cost
	 * something like a tenth of the height of a laptop screen to say the file's name and
	 * then, underneath, what the current tool does -- on a screen whose entire purpose is
	 * to show a photograph as large as it can. One row holds all of it, because the two
	 * things that were competing for width, the title and the tool options, are both
	 * happy to be truncated and neither needed a full row to itself.
	 */
	readonly options: HTMLElement;

	/** The canvas area. Overlays attach here. */
	readonly stage: HTMLElement;

	/**
	 * A scroll container around the stage that never visibly scrolls.
	 *
	 * It exists so a swipe has something real to scroll. Chrome on a Mac decides
	 * whether a Magic Mouse swipe means Back by asking whether the *first scroll* of
	 * the gesture moved anything, and a cancelled wheel event never gets as far as
	 * scrolling -- so cancelling it is read as "nothing scrolled here" and the page
	 * navigates away. This element scrolls instead, the stage is pinned inside it
	 * with `position: sticky`, and the pasteboard turns the scroll into a pan.
	 */
	readonly pasteboard: HTMLElement;

	/** Shows where the canvas is, behind the rendered output. */
	readonly backdrop: HTMLElement;

	/** The sidebar the panel host fills. */
	readonly sidebar: HTMLElement;

	/** Which surface is hosting the editor, so teardown can undo its class. */
	private host: ShellOptions[ 'host' ];

	/** Where toolbar buttons go. */
	readonly actions: HTMLElement;

	private title: HTMLElement;

	private status: HTMLElement;

	/** The tab that restores a hidden sidebar. */
	private sidebarTab: SidebarToggle;

	/**
	 * @param options Shell configuration.
	 */
	constructor( options: ShellOptions ) {
		this.root = options.root;
		this.host = options.host;

		this.root.replaceChildren();

		// Both hosts show the picker in *this* element before a photo is chosen, and the
		// picker styles the element it is given rather than a wrapper inside it. Emptying
		// it is therefore not enough: the class stays, and with it a 16px flex gap and
		// 24px of padding that then apply to the editor -- which is a strip of background
		// between the top bar and the tool rail, and a margin around the whole editor
		// that nothing in its own stylesheet asks for.
		this.root.classList.remove( PICKER_CLASS );
		this.root.classList.add( 'lz-editor' );
		this.root.classList.add( `lz-editor--${ options.host }` );

		// Which house style the *fallback* controls wear. A component the shell has
		// registered brings its own styling; a native input does not, and inside a
		// chromeless iframe no component is registered at all -- so this is the only
		// thing keeping the editor from looking like two plugins glued together.
		this.root.classList.toggle( 'is-desktop-mode', isDesktopModeEnabled() );

		this.topbar = document.createElement( 'div' );
		this.topbar.className = 'lz-topbar';
		this.topbar.setAttribute( 'role', 'toolbar' );
		this.topbar.setAttribute( 'aria-label', __( 'Editor actions' ) );

		this.title = document.createElement( 'h1' );
		this.title.className = 'lz-topbar__title';
		this.title.textContent = __( 'Loading image…' );

		this.options = document.createElement( 'div' );
		this.options.className = 'lz-topbar__options';

		this.actions = document.createElement( 'div' );
		this.actions.className = 'lz-topbar__actions';

		this.topbar.append( this.title, this.options, this.actions );

		const body = document.createElement( 'div' );
		body.className = 'lz-body';

		this.pasteboard = document.createElement( 'div' );
		this.pasteboard.className = 'lz-pasteboard';

		const runway = document.createElement( 'div' );
		runway.className = 'lz-pasteboard__runway';
		runway.setAttribute( 'aria-hidden', 'true' );

		this.stage = document.createElement( 'div' );
		this.stage.className = 'lz-stage';
		this.pasteboard.append( this.stage, runway );

		// Marks out the canvas itself. The checkerboard belongs here rather than on
		// the whole stage: inside the canvas it means "transparent pixels", outside
		// it means nothing at all, and using it for both made the canvas edge
		// invisible the moment a layer was moved off centre.
		this.backdrop = document.createElement( 'div' );
		this.backdrop.className = 'lz-canvas-backdrop';
		this.backdrop.setAttribute( 'aria-hidden', 'true' );
		this.stage.appendChild( this.backdrop );

		this.status = document.createElement( 'p' );
		this.status.className = 'lz-status';
		this.status.textContent = __( 'Loading image…' );
		this.stage.appendChild( this.status );

		this.sidebar = document.createElement( 'aside' );
		this.sidebar.className = 'lz-sidebar';
		this.sidebar.id = 'lz-sidebar';
		this.sidebar.setAttribute( 'aria-label', __( 'Tools' ) );

		this.sidebarTab = createSidebarToggle( this.root, options.onSidebarToggle );

		body.append( this.pasteboard, this.sidebar, this.sidebarTab.el );
		this.root.append( this.topbar, body );
	}

	/**
	 * Shows a message in the stage area.
	 *
	 * @param message What to say.
	 */
	setStatus( message: string ): void {
		this.status.textContent = message;

		if ( ! this.status.isConnected ) {
			this.stage.appendChild( this.status );
		}
	}

	/**
	 * Shows a message the user cannot recover from.
	 *
	 * @param message What went wrong.
	 */
	setError( message: string ): void {
		this.status.classList.add( 'lz-status--error' );
		this.setStatus( message );
	}

	/** Takes the loading message down. */
	clearStatus(): void {
		this.status.remove();
	}

	/**
	 * Puts the image title in the toolbar.
	 *
	 * @param title Image title.
	 */
	setTitle( title: string ): void {
		this.title.textContent = title || __( 'Untitled image' );
	}

	/** Restores the remembered sidebar state. */
	restoreSidebar(): void {
		this.sidebarTab.restore();
	}

	/**
	 * Shows or hides the sidebar.
	 *
	 * @param open Whether the sidebar should be visible.
	 */
	setSidebarOpen( open: boolean ): void {
		this.sidebarTab.setOpen( open );
	}

	/**
	 * Positions the canvas backdrop over wherever the canvas currently is.
	 *
	 * @param viewport Where the canvas sits, or null when nothing is loaded.
	 */
	syncBackdrop(
		viewport: { x: number; y: number; width: number; height: number } | null
	): void {
		if ( ! viewport ) {
			this.backdrop.hidden = true;

			return;
		}

		this.backdrop.hidden = false;
		this.backdrop.style.insetInlineStart = `${ viewport.x }px`;
		this.backdrop.style.insetBlockStart = `${ viewport.y }px`;
		this.backdrop.style.inlineSize = `${ viewport.width }px`;
		this.backdrop.style.blockSize = `${ viewport.height }px`;
	}

	/**
	 * Empties the root and gives back its classes.
	 *
	 * The host modifier goes too, not just `lz-editor`. The same element is handed back
	 * to the picker when a window is emptied, and `lz-editor--window` left behind takes
	 * `block-size: 100%` and `overflow: hidden` with it -- which is a picker that cannot
	 * scroll to the photo you were looking for.
	 */
	destroy(): void {
		this.root.replaceChildren();
		this.root.classList.remove( 'lz-editor', `lz-editor--${ this.host }` );
	}
}
