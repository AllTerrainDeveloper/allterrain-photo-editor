import { describe, expect, it } from 'vitest';
import { eraseTarget, paintTarget } from '../../src/editor/paint-target';
import type { PaintSurfaces } from '../../src/editor/paint-target';
import { RecipeStore } from '../../src/editor/recipe-store';
import { BASE_LAYER_ID, createRasterLayer, createTextLayer } from '../../src/model/document';
import type { CanvasSize, LayerTransform } from '../../src/model/document';
import { defaultRecipe } from '../../src/model/recipe';

const CANVAS = { width: 400, height: 300 };

/**
 * A renderer that knows each layer's texture size and records what it copies.
 *
 * @param sizes Texture size per layer id. Missing means no texture.
 */
function surfaces( sizes: Record< string, CanvasSize > ) {
	const copies: { fromId: string; toId: string; transform: LayerTransform }[] = [];

	const renderer: PaintSurfaces = {
		layerTextureSize: ( id ) => sizes[ id ] ?? { width: 0, height: 0 },
		ensurePaintTexture: ( id ) => {
			sizes[ id ] = { ...CANVAS };
		},
		rasteriseLayer: ( fromId, toId, transform ) => {
			if ( ! sizes[ fromId ] ) {
				return false;
			}

			copies.push( { fromId, toId, transform } );
			sizes[ toId ] = { ...CANVAS };

			return true;
		},
	};

	return { renderer, copies };
}

/** A document showing only the opened photograph. */
function photo() {
	return new RecipeStore( defaultRecipe( 7, CANVAS ), {} );
}

describe( 'eraseTarget', () => {
	it( 'erases a copy of the photograph, kept above the original, which is hidden', () => {
		const store = photo();
		const { renderer, copies } = surfaces( { [ BASE_LAYER_ID ]: { width: 800, height: 600 } } );

		const id = eraseTarget( store, renderer );
		const layers = store.current.layers;

		expect( copies ).toEqual( [
			{ fromId: BASE_LAYER_ID, toId: id, transform: layers[ 0 ].transform },
		] );
		expect( layers.map( ( layer ) => [ layer.id, layer.kind, layer.visible ] ) ).toEqual( [
			[ BASE_LAYER_ID, 'image', false ],
			[ id, 'raster', true ],
		] );
		expect( layers[ 1 ].name ).toBe( 'Image (erased)' );
		expect( store.current.activeLayerId ).toBe( id );
	} );

	it( 'switches a JPEG output to PNG, so what was erased stays transparent', () => {
		const store = photo();
		const { renderer } = surfaces( { [ BASE_LAYER_ID ]: { width: 800, height: 600 } } );

		eraseTarget( store, renderer );

		expect( store.current.output.format ).toBe( 'image/png' );
	} );

	it( 'leaves an output that can already hold transparency alone', () => {
		const store = photo();
		const { renderer } = surfaces( { [ BASE_LAYER_ID ]: { width: 800, height: 600 } } );

		store.setOutput( { format: 'image/webp' } );
		eraseTarget( store, renderer );

		expect( store.current.output.format ).toBe( 'image/webp' );
	} );

	it( 'makes the copy an undo step of its own, under the stroke', () => {
		const store = photo();
		const { renderer } = surfaces( { [ BASE_LAYER_ID ]: { width: 800, height: 600 } } );

		eraseTarget( store, renderer );
		store.undo( 'document' );

		expect( store.current.layers ).toHaveLength( 1 );
		expect( store.current.layers[ 0 ].visible ).toBe( true );
		expect( store.current.activeLayerId ).toBe( BASE_LAYER_ID );
	} );

	it( 'erases a sheet in place', () => {
		const store = photo();
		const sheet = createRasterLayer( 'Paint' );
		const { renderer, copies } = surfaces( {
			[ BASE_LAYER_ID ]: { width: 800, height: 600 },
			[ sheet.id ]: { ...CANVAS },
		} );

		store.setLayers( [ ...store.current.layers, sheet ], sheet.id );

		expect( eraseTarget( store, renderer ) ).toBe( sheet.id );
		expect( copies ).toHaveLength( 0 );
		expect( store.current.layers ).toHaveLength( 2 );
	} );

	it( 'replaces a text layer with its pixels, in the same place in the stack', () => {
		const store = photo();
		const text = createTextLayer(
			'Caption',
			{
				text: 'Hello',
				size: 40,
				family: 'serif',
				colour: '#ffffff',
				bold: false,
				italic: false,
				strokeWidth: 0,
			},
			{ x: 0.25, y: 0.75 }
		);
		const above = createRasterLayer( 'Paint' );
		const { renderer, copies } = surfaces( {
			[ BASE_LAYER_ID ]: { width: 800, height: 600 },
			[ text.id ]: { width: 120, height: 60 },
			[ above.id ]: { ...CANVAS },
		} );

		store.setLayers( [ ...store.current.layers, { ...text, opacity: 0.5 }, above ], text.id );

		const id = eraseTarget( store, renderer );
		const layers = store.current.layers;

		expect( copies[ 0 ].transform ).toEqual( text.transform );
		expect( layers.map( ( layer ) => layer.id ) ).toEqual( [ BASE_LAYER_ID, id, above.id ] );
		expect( layers[ 1 ] ).toMatchObject( { kind: 'raster', name: 'Caption', opacity: 0.5 } );
		expect( layers[ 1 ].text ).toBeUndefined();
		expect( store.current.output.format ).toBe( 'image/jpeg' );
	} );

	it( 'falls back to an ordinary paint layer when there is nothing to copy', () => {
		const store = photo();
		const { renderer, copies } = surfaces( {} );

		const id = eraseTarget( store, renderer );

		expect( copies ).toHaveLength( 0 );
		expect( store.current.layers[ 0 ].visible ).toBe( true );
		expect( store.current.layers.find( ( layer ) => layer.id === id )?.name ).toBe( 'Paint' );
	} );
} );

describe( 'paintTarget', () => {
	it( 'still sends paint aimed at the photograph to a new layer, leaving the photograph alone', () => {
		const store = photo();
		const { renderer, copies } = surfaces( { [ BASE_LAYER_ID ]: { width: 800, height: 600 } } );

		const id = paintTarget( store, renderer );

		expect( copies ).toHaveLength( 0 );
		expect( id ).not.toBe( BASE_LAYER_ID );
		expect( store.current.layers[ 0 ].visible ).toBe( true );
	} );
} );
