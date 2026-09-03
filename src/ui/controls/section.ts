/**
 * Section containers.
 */

import { componentTag } from '../../platform';

export interface SectionOptions {
	/**
	 * Builds a small subheading inside a panel rather than the shell's section.
	 *
	 * The shell's `<os-section>` is a Preferences-page section: a large heading and a
	 * boxed body with its own padding. Inside a sidebar panel that reads as a blank
	 * block under a title twice the size of everything around it. A panel wants the
	 * same small uppercase label its own header uses.
	 */
	compact?: boolean;
	/** Controls that belong to the section. Placed inside it, so the gap is its own. */
	children?: HTMLElement[];
}

/**
 * Builds a titled section, preferring the shell's own section.
 *
 * @param heading Section title.
 * @param options Optional. Compact rendering and the controls to hold.
 */
export function createSection( heading: string, options: SectionOptions = {} ): HTMLElement {
	const tag = options.compact ? null : componentTag( 'section' );

	if ( tag ) {
		const section = document.createElement( tag );
		section.setAttribute( 'heading', heading );
		section.setAttribute( 'stack', '' );
		section.classList.add( 'lz-section' );
		section.append( ...( options.children ?? [] ) );

		return section;
	}

	const section = document.createElement( 'section' );
	section.className = options.compact ? 'lz-section lz-section--compact' : 'lz-section';

	const title = document.createElement( 'h3' );
	title.className = 'lz-section__heading';
	title.textContent = heading;
	section.append( title, ...( options.children ?? [] ) );

	return section;
}
