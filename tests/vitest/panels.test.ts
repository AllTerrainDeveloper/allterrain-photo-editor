import { defaultBrush } from '../../src/ui/stage-tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PanelHost,
	listPanels,
	onPanelsChanged,
	registerPanel,
	unregisterPanel,
} from '../../src/ui/panels';
import type { PanelContext } from '../../src/ui/panels';
import type { MediaPayload } from '../../src/types';

const PAYLOAD = {
	id: 1,
	sourceId: 1,
	mime: 'image/jpeg',
	url: '',
	sourceUrl: '',
	width: 100,
	height: 50,
	title: 'Test',
	alt: '',
	recipe: { version: 1, source: 1, ops: [], output: { format: 'image/jpeg', quality: 0.9 } },
	canSave: true,
	schema: {},
} as unknown as MediaPayload;

function context(): PanelContext {
	return {
		payload: PAYLOAD,
		getRecipe: () => PAYLOAD.recipe,
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
		getViewport: () => ( { x: 0, y: 0, width: 100, height: 100 } ),
		onViewportChange: () => () => {},
		onHistogram: () => () => {},
		onRecipeChange: () => () => {},
		listPresets: async () => [],
		savePreset: async () => ( { id: '', name: '', recipe: { version: 2, ops: [], curves: {}, levels: { black: 0, white: 255, gamma: 1 } } } ),
		deletePreset: async () => {},
		applyPreset: () => {},
		getLayers: () => [],
		getActiveLayerId: () => 'base',
		setLayers: () => {},
		addLayer: () => {},
		editTextLayer: () => {},
		getBrush: () => defaultBrush(),
		setBrush: () => {},
		onBrushChange: () => () => {},
		getView: () => ( { rulers: true, snapping: true } ),
		setView: () => {},
	};
}

/** Clears the registry between tests, since it is module-level state. */
function clearRegistry(): void {
	for ( const def of listPanels() ) {
		unregisterPanel( def.id );
	}
}

beforeEach( () => {
	clearRegistry();
	window.localStorage.clear();
} );

afterEach( () => {
	clearRegistry();
} );

describe( 'panel registry', () => {
	it( 'sorts by order, defaulting unordered panels to the end', () => {
		registerPanel( { id: 'c', title: 'C', render: () => {} } );
		registerPanel( { id: 'a', title: 'A', order: 10, render: () => {} } );
		registerPanel( { id: 'b', title: 'B', order: 20, render: () => {} } );

		expect( listPanels().map( ( d ) => d.id ) ).toEqual( [ 'a', 'b', 'c' ] );
	} );

	it( 'replaces by id, so a plugin can override a built-in', () => {
		registerPanel( { id: 'histogram', title: 'Original', render: () => {} } );
		registerPanel( { id: 'histogram', title: 'Replacement', render: () => {} } );

		expect( listPanels() ).toHaveLength( 1 );
		expect( listPanels()[ 0 ].title ).toBe( 'Replacement' );
	} );

	it( 'notifies subscribers on register and unregister', () => {
		const seen = vi.fn();
		const off = onPanelsChanged( seen );

		registerPanel( { id: 'a', title: 'A', render: () => {} } );
		expect( seen ).toHaveBeenCalledTimes( 1 );

		unregisterPanel( 'a' );
		expect( seen ).toHaveBeenCalledTimes( 2 );

		// Removing something that was never there is not a change.
		unregisterPanel( 'nope' );
		expect( seen ).toHaveBeenCalledTimes( 2 );

		off();
		registerPanel( { id: 'b', title: 'B', render: () => {} } );
		expect( seen ).toHaveBeenCalledTimes( 2 );
	} );
} );

describe( 'PanelHost', () => {
	it( 'renders a panel body and honours defaultCollapsed', () => {
		registerPanel( {
			id: 'open',
			title: 'Open',
			order: 1,
			render: ( host ) => {
				host.textContent = 'open-body';
			},
		} );
		registerPanel( {
			id: 'shut',
			title: 'Shut',
			order: 2,
			defaultCollapsed: true,
			render: ( host ) => {
				host.textContent = 'shut-body';
			},
		} );

		const root = document.createElement( 'div' );
		const host = new PanelHost( root, context() );

		const bodies = root.querySelectorAll< HTMLElement >( '.lz-panel__body' );

		expect( bodies ).toHaveLength( 2 );
		expect( bodies[ 0 ].hidden ).toBe( false );
		expect( bodies[ 1 ].hidden ).toBe( true );
		// Collapsed panels keep their content so a reopen is instant.
		expect( bodies[ 1 ].textContent ).toBe( 'shut-body' );

		host.destroy();
	} );

	it( 'toggles a panel and persists the state', () => {
		registerPanel( { id: 'a', title: 'A', render: () => {} } );

		const root = document.createElement( 'div' );
		const host = new PanelHost( root, context() );

		const header = root.querySelector< HTMLElement >( '.lz-panel__header' )!;
		const body = root.querySelector< HTMLElement >( '.lz-panel__body' )!;

		expect( header.getAttribute( 'aria-expanded' ) ).toBe( 'true' );

		header.click();

		expect( body.hidden ).toBe( true );
		expect( header.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
		expect( window.localStorage.getItem( 'lienzo.panels.v1' ) ).toContain(
			'"collapsed":true'
		);

		host.destroy();
	} );

	it( 'restores collapsed state from a previous session', () => {
		window.localStorage.setItem(
			'lienzo.panels.v1',
			JSON.stringify( { a: { collapsed: true } } )
		);

		registerPanel( { id: 'a', title: 'A', render: () => {} } );

		const root = document.createElement( 'div' );
		const host = new PanelHost( root, context() );

		expect( root.querySelector< HTMLElement >( '.lz-panel__body' )!.hidden ).toBe( true );

		host.destroy();
	} );

	it( 'hides a panel the user switched off', () => {
		window.localStorage.setItem(
			'lienzo.panels.v1',
			JSON.stringify( { a: { hidden: true } } )
		);

		registerPanel( { id: 'a', title: 'A', render: () => {} } );
		registerPanel( { id: 'b', title: 'B', render: () => {} } );

		const root = document.createElement( 'div' );
		const host = new PanelHost( root, context() );

		expect( root.querySelectorAll( '.lz-panel' ) ).toHaveLength( 1 );
		expect(
			root.querySelector< HTMLElement >( '.lz-panel' )!.dataset.panel
		).toBe( 'b' );

		host.destroy();
	} );

	it( 'shows a panel registered after the editor opened', () => {
		const root = document.createElement( 'div' );
		const host = new PanelHost( root, context() );

		expect( root.querySelectorAll( '.lz-panel' ) ).toHaveLength( 0 );

		registerPanel( { id: 'late', title: 'Late', render: () => {} } );

		expect( root.querySelectorAll( '.lz-panel' ) ).toHaveLength( 1 );

		host.destroy();
	} );

	it( 'runs panel teardowns on destroy', () => {
		const teardown = vi.fn();

		registerPanel( { id: 'a', title: 'A', render: () => teardown } );

		const root = document.createElement( 'div' );
		const host = new PanelHost( root, context() );

		expect( teardown ).not.toHaveBeenCalled();

		host.destroy();

		expect( teardown ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'runs teardowns before re-rendering, so listeners cannot accumulate', () => {
		const teardown = vi.fn();

		registerPanel( { id: 'a', title: 'A', render: () => teardown } );

		const root = document.createElement( 'div' );
		const host = new PanelHost( root, context() );

		// A second registration triggers a full re-render.
		registerPanel( { id: 'b', title: 'B', render: () => {} } );

		expect( teardown ).toHaveBeenCalledTimes( 1 );

		host.destroy();
	} );

	it( 'survives storage being unavailable', () => {
		// Private browsing and some embedded webviews throw on access. A panel
		// layout is not worth breaking the editor over.
		const spy = vi.spyOn( window.localStorage, 'getItem' ).mockImplementation( () => {
			throw new Error( 'denied' );
		} );

		registerPanel( { id: 'a', title: 'A', render: () => {} } );

		const root = document.createElement( 'div' );

		expect( () => new PanelHost( root, context() ).destroy() ).not.toThrow();

		spy.mockRestore();
	} );
} );
