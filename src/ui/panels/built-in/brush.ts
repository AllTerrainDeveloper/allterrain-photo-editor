/**
 * The Brush panel.
 *
 * The options bar edits the same settings, so every control here follows
 * `onBrushChange` rather than assuming it is the only view of the brush.
 */

import { BRUSH_SHAPES } from '../../../engine/brush';
import type { BrushShape } from '../../../engine/brush';
import { RETOUCH_MODES, TONE_MODES } from '../../../engine/pixel-tools';
import type { PixelOp } from '../../../engine/pixel-tools';
import { __ } from '../../../i18n';
import {
	createColourField,
	createSection,
	createSelect,
	createSlider,
} from '../../controls';
import type { SelectHandle, SliderHandle } from '../../controls';
import type { BrushSettings } from '../../stage-tools';
import { registerPanel } from '../registry';
import type { PanelContext } from '../types';
import { syncSelectValue } from './shared';

/** A percentage slider over one 0..1 brush setting. */
function percentSlider(
	label: string,
	key: 'hardness' | 'opacity' | 'strength',
	resetTo: number,
	min: number,
	ctx: PanelContext
): SliderHandle {
	return createSlider( {
		label,
		min,
		max: 100,
		step: 1,
		suffix: '%',
		value: Math.round( ctx.getBrush()[ key ] * 100 ),
		resetTo,
		onInput: ( value ) => ctx.setBrush( { [ key ]: value / 100 } ),
	} );
}

/** A dropdown over one of the brush's enumerated modes. */
function modeSelect(
	label: string,
	value: string,
	modes: Array< { value: PixelOp; label: string } >,
	onChange: ( value: PixelOp ) => void
): SelectHandle {
	return createSelect( {
		label,
		value,
		options: modes.map( ( entry ) => ( {
			value: entry.value,
			label: __( entry.label ),
		} ) ),
		onChange: ( next ) => onChange( next as PixelOp ),
	} );
}

/** Registers the Brush panel. */
export function registerBrushPanel(): void {
	registerPanel( {
		id: 'brush',
		title: __( 'Brush' ),
		order: 8,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const shape = createSelect( {
				label: __( 'Shape' ),
				value: ctx.getBrush().shape,
				options: BRUSH_SHAPES.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) => ctx.setBrush( { shape: value as BrushShape } ),
			} );

			const size = createSlider( {
				label: __( 'Size' ),
				min: 1,
				max: 400,
				step: 1,
				suffix: 'px',
				value: ctx.getBrush().size,
				resetTo: 40,
				onInput: ( value ) => ctx.setBrush( { size: value } ),
			} );

			const hardness = percentSlider( __( 'Hardness' ), 'hardness', 60, 0, ctx );
			const opacity = percentSlider( __( 'Opacity' ), 'opacity', 100, 1, ctx );
			const strength = percentSlider( __( 'Strength' ), 'strength', 50, 1, ctx );

			const tolerance = createSlider( {
				label: __( 'Fill tolerance' ),
				min: 0,
				max: 128,
				step: 1,
				value: ctx.getBrush().tolerance,
				resetTo: 32,
				onInput: ( value ) => ctx.setBrush( { tolerance: value } ),
			} );

			const retouch = modeSelect(
				__( 'Retouch mode' ),
				ctx.getBrush().retouch,
				RETOUCH_MODES,
				( value ) => ctx.setBrush( { retouch: value } )
			);

			const tone = modeSelect(
				__( 'Dodge & burn mode' ),
				ctx.getBrush().tone,
				TONE_MODES,
				( value ) => ctx.setBrush( { tone: value } )
			);

			const colour = createColourField( {
				label: __( 'Colour' ),
				value: ctx.getBrush().colour,
				onChange: ( value ) => ctx.setBrush( { colour: value } ),
			} );

			// Without this the two views drift apart and the panel reports a brush
			// nobody is using.
			const off = ctx.onBrushChange( ( brush: BrushSettings ) => {
				size.setValue( Math.round( brush.size ) );
				hardness.setValue( Math.round( brush.hardness * 100 ) );
				opacity.setValue( Math.round( brush.opacity * 100 ) );
				strength.setValue( Math.round( brush.strength * 100 ) );
				tolerance.setValue( Math.round( brush.tolerance ) );

				colour.setValue( brush.colour );
				syncSelectValue( shape.el, brush.shape );
				syncSelectValue( retouch.el, brush.retouch );
				syncSelectValue( tone.el, brush.tone );
			} );

			// Subheadings of this panel, holding their own controls, rather than empty
			// shell sections dropped between them -- which drew a Preferences-sized
			// title over a blank box.
			host.append(
				shape.el,
				size.el,
				hardness.el,
				opacity.el,
				colour.el,
				createSection( __( 'Retouching' ), {
					compact: true,
					children: [ retouch.el, tone.el, strength.el ],
				} ),
				createSection( __( 'Fill' ), { compact: true, children: [ tolerance.el ] } )
			);

			const controls = [
				shape,
				size,
				hardness,
				opacity,
				colour,
				strength,
				retouch,
				tone,
				tolerance,
			];

			return () => {
				off();

				for ( const control of controls ) {
					control.destroy();
				}
			};
		},
	} );
}
