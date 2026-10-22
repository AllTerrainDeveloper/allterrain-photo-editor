/**
 * Dropdowns.
 */

import { componentTag, onShellEvent } from '../../platform';
import { fieldId, nameControl, siblingTag } from './internals';
import type { ControlHandle, ControlOption } from './types';

/** Handle on a built select. */
export interface SelectHandle extends ControlHandle {
	getValue: () => string;
	/** Shows a value chosen somewhere else, without reporting it as a change. */
	setValue: ( value: string ) => void;
}

export interface SelectOptions {
	label: string;
	value: string;
	options: ControlOption[];
	/**
	 * Builds the dropdown from a plain `<select>` rather than the shell's component.
	 *
	 * For the options bar. The shell's select is a panel control: 8px of padding around
	 * a 1.5 line-height puts its trigger at 38px, and the bar is 31px tall. See
	 * createNumberField() for why the height cannot be taken back from outside.
	 */
	compact?: boolean;
	onChange: ( value: string ) => void;
}

/**
 * Builds a labelled dropdown.
 *
 * The select component is not in the shell's eagerly registered set, so this usually
 * falls back to a native `<select>` -- which is no loss: a native select gets the
 * platform's own picker, which on touch devices is considerably better than
 * anything a web component reimplements.
 *
 * @param options Select configuration.
 */
export function createSelect( options: SelectOptions ): SelectHandle {
	const tag = options.compact ? null : componentTag( 'select' );
	const useWpd = null !== tag;

	const wrap = document.createElement( 'div' );
	wrap.className = options.compact
		? 'lz-field lz-field--compact'
		: 'lz-field';

	const label = document.createElement( 'label' );
	label.className = 'lz-field__label';
	label.textContent = options.label;

	const select = document.createElement( tag ?? 'select' );
	select.className = 'lz-field__control';

	if ( useWpd ) {
		// A custom element is not a labelable element, so `for` cannot reach it. Chrome
		// says so out loud -- "Incorrect use of <label for=FORM_ELEMENT>" -- and it is
		// right: the attribute is ignored, so the control ends up with no accessible name
		// at all while looking, in the markup, as though it has one. `aria-labelledby`
		// points the other way and works on anything.
		const id = fieldId( 'select-label' );

		label.id = id;
		select.setAttribute( 'aria-labelledby', id );
	} else {
		nameControl( select as HTMLSelectElement, label, 'select' );
	}

	for ( const option of options.options ) {
		const node = document.createElement(
			tag ? siblingTag( tag, 'option' ) : 'option'
		);
		node.setAttribute( 'value', option.value );
		node.textContent = option.label;
		select.appendChild( node );
	}

	const write = ( value: string ) => {
		if ( useWpd ) {
			select.setAttribute( 'value', value );
		} else {
			( select as HTMLSelectElement ).value = value;
		}
	};

	write( options.value );

	const read = () =>
		useWpd
			? select.getAttribute( 'value' ) ?? options.value
			: ( select as HTMLSelectElement ).value;

	const onChange = () => options.onChange( read() );

	// `change` covers the native fallback; the shell spellings cover the component.
	select.addEventListener( 'change', onChange );

	const off = onShellEvent( select, 'change', onChange );

	wrap.append( label, select );

	return {
		el: wrap,
		getValue: read,
		setValue: write,
		destroy: () => {
			select.removeEventListener( 'change', onChange );
			off();
		},
	};
}
