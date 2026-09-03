import { describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas, so the rasteriser is stood in for: a bitmap of a known
// size with the padding `textCanvas()` puts around the glyphs. What is under test is
// the geometry and the layer bookkeeping around it, not the pixels.
vi.mock( '../../src/engine/paint-shapes', async ( importOriginal ) => {
	const original = await importOriginal< typeof import('../../src/engine/paint-shapes') >();

	return {
		...original,
		textCanvas: ( options: { text: string; size: number } ) => {
			if ( ! options.text.trim() ) {
				return null;
			}

			const lines = options.text.split( '\n' );
			const pad = Math.ceil( options.size * 0.35 );
			const widest = Math.max( ...lines.map( ( line ) => line.length ) ) * options.size * 0.5;

			return {
				canvas: {
					width: Math.ceil( widest ) + pad * 2,
					height: Math.ceil( options.size * 1.25 ) * lines.length + pad * 2,
				} as unknown as HTMLCanvasElement,
				offsetX: -pad,
				offsetY: -pad,
			};
		},
	};
} );

import {
	createTextLayer,
	normaliseLayers,
	normaliseTextSource,
} from '../../src/model/document';
import type { Layer, TextSource } from '../../src/model/document';
import { defaultRecipe } from '../../src/model/recipe';
import { RecipeStore } from '../../src/editor/recipe-store';
import {
	drawTextLayer,
	hitTextLayer,
	rasteriseTextLayer,
	replaceTextLayer,
	textPlacement,
} from '../../src/editor/text-layer';
import type { ImportTarget } from '../../src/editor/layer-import';

const CANVAS = { width: 1000, height: 800 };

const STYLE = {
	size: 40,
	family: 'sans-serif',
	colour: '#ff0000',
	bold: false,
	italic: false,
	strokeWidth: 0,
};

/** A fake renderer that remembers what each layer was given. */
function fakeRenderer() {
	const textures = new Map< string, { width: number; height: number } >();

	return {
		textures,
		addRasterTexture: ( id: string, source: HTMLCanvasElement | HTMLImageElement ) => {
			textures.set( id, { width: source.width, height: source.height } );
		},
		layerTextureSize: ( id: string ) => textures.get( id ) ?? { width: 0, height: 0 },
	};
}

/**
 * An editor with a sized canvas and the fake renderer.
 *
 * @param style Brush text style.
 */
function target( style = STYLE ) {
	const store = new RecipeStore( defaultRecipe( 7, CANVAS ), {} );
	const renderer = fakeRenderer();

	const editor: ImportTarget = {
		store,
		client: {} as ImportTarget[ 'client' ],
		renderer,
		stage: document.createElement( 'div' ),
		getViewport: () => null,
		getTextStyle: () => style,
		isDestroyed: () => false,
		setActiveTool: () => {},
	};

	return { editor, store, renderer };
}

describe( 'normaliseTextSource', () => {
	it( 'keeps the words as typed, including punctuation that looks like markup', () => {
		const source = normaliseTextSource( {
			text: 'I <3 you\nsecond line',
			size: 48,
			family: 'Georgia, serif',
			colour: '#00ff00',
			bold: true,
			italic: false,
			strokeWidth: 2,
		} );

		expect( source ).toEqual( {
			text: 'I <3 you\nsecond line',
			size: 48,
			family: 'Georgia, serif',
			colour: '#00ff00',
			bold: true,
			italic: false,
			strokeWidth: 2,
		} );
	} );

	it( 'is null for anything without words', () => {
		expect( normaliseTextSource( null ) ).toBeNull();
		expect( normaliseTextSource( { size: 40 } ) ).toBeNull();
		expect( normaliseTextSource( { text: '   \n ' } ) ).toBeNull();
	} );

	it( 'falls back on a bad colour or size and strips control characters', () => {
		const source = normaliseTextSource( {
			text: 'ab​c',
			size: 'huge',
			colour: 'red',
		} );

		expect( source?.text ).toBe( 'abc' );
		expect( source?.size ).toBe( 72 );
		expect( source?.colour ).toBe( '#000000' );
		expect( source?.family ).toBe( 'sans-serif' );
	} );
} );

describe( 'normaliseLayers', () => {
	it( 'keeps a text layer and its source', () => {
		const layers = normaliseLayers( [
			{ id: 'base', kind: 'image' },
			{
				id: 'layer-abc',
				name: 'Hello',
				kind: 'text',
				text: { text: 'Hello', size: 40, colour: '#ffffff' },
			},
		] );

		expect( layers[ 1 ].kind ).toBe( 'text' );
		expect( layers[ 1 ].text?.text ).toBe( 'Hello' );
		expect( layers[ 1 ].text?.colour ).toBe( '#ffffff' );
	} );

	it( 'downgrades a text layer that lost its words to a raster layer', () => {
		const layers = normaliseLayers( [ { id: 'x', kind: 'text' } ] );

		expect( layers[ 0 ].kind ).toBe( 'raster' );
		expect( layers[ 0 ].text ).toBeUndefined();
	} );
} );

describe( 'drawTextLayer', () => {
	it( 'adds a text layer that remembers its words and style', () => {
		const { editor, store, renderer } = target();

		expect( drawTextLayer( editor, 'Hello', { x: 100, y: 200 } ) ).toBe( true );

		const layer = store.current.layers[ 1 ];

		expect( layer.kind ).toBe( 'text' );
		expect( layer.name ).toBe( 'Hello' );
		expect( layer.text ).toEqual( { ...STYLE, text: 'Hello' } );
		expect( store.current.activeLayerId ).toBe( layer.id );
		expect( renderer.textures.has( layer.id ) ).toBe( true );
	} );

	it( 'places the caret back exactly where the words start', () => {
		const { editor, store } = target();

		drawTextLayer( editor, 'Hello\nworld', { x: 123, y: 456 } );

		const placement = textPlacement( store.current.layers[ 1 ], CANVAS );

		expect( placement?.point.x ).toBeCloseTo( 123, 6 );
		expect( placement?.point.y ).toBeCloseTo( 456, 6 );
		expect( placement?.scale ).toEqual( { x: 1, y: 1 } );
	} );

	it( 'follows a layer that has since been moved and scaled', () => {
		const { editor, store } = target();

		drawTextLayer( editor, 'Hi', { x: 100, y: 100 } );

		const layer = store.current.layers[ 1 ];
		const moved: Layer = {
			...layer,
			transform: { ...layer.transform, x: 0.5, y: 0.5, scaleX: 2, scaleY: 2 },
		};

		const placement = textPlacement( moved, CANVAS )!;

		// Retyping at the placement it reports must land the centre back where it is.
		store.setLayers( [ store.current.layers[ 0 ], moved ], moved.id );
		replaceTextLayer( editor, moved.id, 'Hi', placement.point );

		const retyped = store.current.layers[ 1 ];

		expect( retyped.transform.x ).toBeCloseTo( 0.5, 6 );
		expect( retyped.transform.y ).toBeCloseTo( 0.5, 6 );
		expect( retyped.transform.scaleX ).toBe( 2 );
	} );
} );

describe( 'replaceTextLayer', () => {
	it( 'swaps the layer for a new one in the same position, keeping its settings', () => {
		const { editor, store, renderer } = target();

		drawTextLayer( editor, 'Old', { x: 50, y: 60 } );

		const old = store.current.layers[ 1 ];

		store.setLayers( [
			store.current.layers[ 0 ],
			{ ...old, visible: false, opacity: 0.4 },
		] );

		const placement = textPlacement( store.current.layers[ 1 ], CANVAS )!;

		expect( replaceTextLayer( editor, old.id, 'New words', placement.point ) ).toBe( true );

		const layers = store.current.layers;
		const fresh = layers[ 1 ];

		expect( layers ).toHaveLength( 2 );
		expect( fresh.id ).not.toBe( old.id );
		expect( fresh.text?.text ).toBe( 'New words' );
		expect( fresh.name ).toBe( 'New words' );
		expect( fresh.visible ).toBe( false );
		expect( fresh.opacity ).toBe( 0.4 );
		expect( store.current.activeLayerId ).toBe( fresh.id );
		expect( renderer.textures.has( fresh.id ) ).toBe( true );

		// The old id is still on the undo stack, so its texture must stay reachable.
		expect( store.canUndo ).toBe( true );
		store.undo( 'all' );
		expect( store.current.layers[ 1 ].id ).toBe( old.id );
	} );

	it( 'keeps the first line anchored when the words change', () => {
		const { editor, store } = target();

		drawTextLayer( editor, 'Short', { x: 300, y: 300 } );

		const id = store.current.layers[ 1 ].id;
		const placement = textPlacement( store.current.layers[ 1 ], CANVAS )!;

		replaceTextLayer( editor, id, 'A much longer line of text\nand another', placement.point );

		const after = textPlacement( store.current.layers[ 1 ], CANVAS )!;

		expect( after.point.x ).toBeCloseTo( 300, 6 );
		expect( after.point.y ).toBeCloseTo( 300, 6 );
	} );

	it( 'removes the layer when every word is deleted', () => {
		const { editor, store } = target();

		drawTextLayer( editor, 'Gone', { x: 10, y: 10 } );

		const id = store.current.layers[ 1 ].id;

		expect( replaceTextLayer( editor, id, '   ', { x: 10, y: 10 } ) ).toBe( true );
		expect( store.current.layers ).toHaveLength( 1 );
	} );

	it( 'leaves a layer that is not text alone', () => {
		const { editor, store } = target();

		expect( replaceTextLayer( editor, 'base', 'x', { x: 0, y: 0 } ) ).toBe( false );
		expect( store.current.layers ).toHaveLength( 1 );
	} );
} );

describe( 'rasteriseTextLayer', () => {
	it( 'draws a text layer from its words alone', () => {
		const renderer = fakeRenderer();
		const source: TextSource = { ...STYLE, text: 'Again' };
		const layer = createTextLayer( 'Again', source );

		expect( rasteriseTextLayer( renderer, layer ) ).toBe( true );
		expect( renderer.textures.get( layer.id )?.width ).toBeGreaterThan( 0 );
	} );

	it( 'does nothing for a layer without words', () => {
		const renderer = fakeRenderer();

		expect(
			rasteriseTextLayer( renderer, {
				id: 'r',
				name: 'r',
				kind: 'raster',
				transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false },
				visible: true,
				opacity: 1,
			} )
		).toBe( false );
	} );
} );

describe( 'hitTextLayer', () => {
	it( 'finds the front-most visible text layer under a point', () => {
		const { editor, store, renderer } = target();

		drawTextLayer( editor, 'Bottom', { x: 100, y: 100 } );
		drawTextLayer( editor, 'Top', { x: 100, y: 100 } );

		const [ , bottom, top ] = store.current.layers;

		expect( hitTextLayer( store.current, renderer, { x: 110, y: 110 } )?.id ).toBe( top.id );

		store.setLayers( [
			store.current.layers[ 0 ],
			bottom,
			{ ...top, visible: false },
		] );

		expect( hitTextLayer( store.current, renderer, { x: 110, y: 110 } )?.id ).toBe( bottom.id );
		expect( hitTextLayer( store.current, renderer, { x: 900, y: 700 } ) ).toBeNull();
	} );
} );
