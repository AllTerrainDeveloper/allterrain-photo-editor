import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrush } from '../../src/ui/stage-tools';
import { listPanels } from '../../src/ui/panels';
import type { PanelContext } from '../../src/ui/panels';
import { registerLayersPanel } from '../../src/ui/panels/built-in/layers';
import { IDENTITY_TRANSFORM } from '../../src/model/document';
import type { Layer } from '../../src/model/document';
import type { MediaPayload } from '../../src/types';

function layer( id: string, patch: Partial< Layer > = {} ): Layer {
	return {
		id,
		name: id,
		kind: 'raster',
		transform: { ...IDENTITY_TRANSFORM },
		visible: true,
		opacity: 1,
		...patch,
	};
}

/**
 * A panel context over a mutable layer stack.
 *
 * @param layers Starting stack.
 * @param active Active layer id.
 */
function context( layers: Layer[], active: string ) {
	let listener: ( () => void ) | null = null;
	const setLayers = vi.fn( ( next: Layer[], activeId?: string ) => {
		layers = next;
		active = activeId ?? active;
		listener?.();
	} );

	const ctx = {
		payload: {} as MediaPayload,
		getRecipe: () => ( {} ) as never,
		setOp: () => {},
		setOutput: () => {},
		setSpace: () => {},
		setLayer: () => {},
		setDocument: () => {},
		getImageSize: () => ( { width: 100, height: 50 } ),
		getActiveTool: () => 'transform' as const,
		setActiveTool: () => {},
		onActiveToolChange: () => () => {},
		setCurve: () => {},
		setLevels: () => {},
		stage: document.createElement( 'div' ),
		getViewport: () => null,
		onViewportChange: () => () => {},
		onHistogram: () => () => {},
		onRecipeChange: ( fn: () => void ) => {
			listener = fn;

			return () => {
				listener = null;
			};
		},
		listPresets: async () => [],
		savePreset: async () => ( {} ) as never,
		deletePreset: async () => {},
		applyPreset: () => {},
		getLayers: () => layers,
		getActiveLayerId: () => active,
		setLayers,
		addLayer: () => {},
		editTextLayer: vi.fn(),
		getBrush: () => defaultBrush(),
		setBrush: () => {},
		onBrushChange: () => () => {},
		getView: () => ( { rulers: false, snapping: false } ),
		setView: () => {},
	} as unknown as PanelContext;

	return { ctx, setLayers, layers: () => layers };
}

/** Renders the Layers panel into a fresh host. */
function render( ctx: PanelContext ) {
	registerLayersPanel();

	const def = listPanels().find( ( panel ) => panel.id === 'layers' )!;
	const host = document.createElement( 'div' );

	document.body.appendChild( host );

	const teardown = def.render( host, ctx );

	return { host, teardown };
}

afterEach( () => {
	document.body.innerHTML = '';
} );

describe( 'Layers panel opacity', () => {
	it( 'shows the active layer opacity and writes it back on a drag', () => {
		const { ctx, setLayers, layers } = context(
			[ layer( 'base', { kind: 'image' } ), layer( 'paint', { opacity: 0.4 } ) ],
			'paint'
		);
		const { host } = render( ctx );
		const range = host.querySelector< HTMLInputElement >( 'input[type=range]' )!;

		expect( range ).not.toBeNull();
		expect( range.value ).toBe( '40' );

		range.value = '25';
		range.dispatchEvent( new Event( 'input', { bubbles: true } ) );

		expect( setLayers ).toHaveBeenCalledTimes( 1 );
		expect( layers()[ 1 ].opacity ).toBeCloseTo( 0.25 );
		expect( layers()[ 0 ].opacity ).toBe( 1 );
	} );

	it( 'follows the active layer when the selection changes', () => {
		const { ctx, setLayers, layers } = context(
			[ layer( 'base', { kind: 'image' } ), layer( 'paint', { opacity: 0.5 } ) ],
			'base'
		);
		const { host } = render( ctx );
		const range = host.querySelector< HTMLInputElement >( 'input[type=range]' )!;

		expect( range.value ).toBe( '100' );

		// Selecting the other layer, as its row does.
		setLayers( layers(), 'paint' );

		expect( range.value ).toBe( '50' );
	} );

	it( 'marks a faded layer in its row', () => {
		const { ctx } = context( [ layer( 'base', { kind: 'image' } ), layer( 'paint', { opacity: 0.3 } ) ], 'paint' );
		const { host } = render( ctx );

		expect( host.querySelector( '.lz-layer__opacity' )?.textContent ).toBe( '30%' );
	} );
} );
