import { describe, expect, it } from 'vitest';
import { PaintApi } from '../../src/engine/renderer/paint-api';
import type { GpuContext } from '../../src/engine/renderer/gpu';
import type { LayerTextures } from '../../src/engine/renderer/layer-textures';

/** One draw the fake GPU was asked for. */
interface Draw {
	into: string;
	clear: boolean;
	/** The sprites in the drawn container, as they were configured. */
	sprites: FakeSprite[];
}

interface FakeSprite {
	kind: 'sprite';
	texture: FakeTexture;
	alpha: number;
	tint: string | null;
	blendMode: string;
	anchor: { set: ( v: number ) => void };
	position: { set: ( x: number, y: number ) => void };
	width: number;
	height: number;
	mask: unknown;
	destroy: () => void;
}

interface FakeTexture {
	name: string;
	width: number;
	height: number;
	target: boolean;
	destroyed: boolean;
	destroy: () => void;
}

interface FakeContainer {
	kind: 'container';
	children: FakeSprite[];
	addChild: ( child: FakeSprite ) => void;
	destroy: () => void;
}

/**
 * A GPU that records what it is asked to draw.
 */
function fakeGpu() {
	const draws: Draw[] = [];
	let targets = 0;

	const texture = ( name: string, target: boolean, width = 100, height = 80 ): FakeTexture => {
		const t: FakeTexture = {
			name,
			width,
			height,
			target,
			destroyed: false,
			destroy: () => {
				t.destroyed = true;
			},
		};

		return t;
	};

	const gpu = {
		draws,
		createTarget: ( width: number, height: number ) =>
			texture( `target-${ ++targets }`, true, width, height ),
		textureFrom: () => texture( 'stamp', false, 10, 10 ),
		sprite: ( tex: FakeTexture ): FakeSprite => ( {
			kind: 'sprite',
			texture: tex,
			alpha: 1,
			tint: null,
			blendMode: 'normal',
			anchor: { set: () => {} },
			position: { set: () => {} },
			width: 0,
			height: 0,
			mask: null,
			destroy: () => {},
		} ),
		container: (): FakeContainer => {
			const children: FakeSprite[] = [];

			return {
				kind: 'container',
				children,
				addChild: ( child ) => void children.push( child ),
				destroy: () => {},
			};
		},
		draw: ( what: FakeSprite | FakeContainer, into: FakeTexture, clear = false ) => {
			draws.push( {
				into: into.name,
				clear,
				sprites: 'container' === what.kind ? [ ...what.children ] : [ what ],
			} );
		},
		drawDetached: ( sprite: FakeSprite, into: FakeTexture, clear = false ) => {
			draws.push( { into: into.name, clear, sprites: [ sprite ] } );
		},
		isTarget: ( tex: FakeTexture ) => tex.target,
		resolve: ( tex: FakeTexture ) => ( { texture: tex, owned: false } ),
		extractCanvas: ( tex: FakeTexture ) =>
			( { width: tex.width, height: tex.height, from: tex.name } as unknown as HTMLCanvasElement ),
		solidTexture: () => texture( 'solid', false, 1, 1 ),
	};

	return gpu;
}

/**
 * Layer textures that hand out one paintable target per layer and clip nothing.
 *
 * @param gpu The fake GPU.
 */
function fakeLayers( gpu: ReturnType< typeof fakeGpu > ) {
	const textures = new Map< string, FakeTexture >();

	return {
		textures,
		get: ( id: string ) => textures.get( id ),
		has: ( id: string ) => textures.has( id ),
		sizeOf: ( id: string ) => {
			const t = textures.get( id );

			return { width: t?.width ?? 0, height: t?.height ?? 0 };
		},
		ensurePaintable: ( id: string ) => {
			let t = textures.get( id );

			if ( ! t ) {
				t = gpu.createTarget( 100, 80 );
				t.name = `layer-${ id }`;
				textures.set( id, t );
			}

			return t;
		},
		addRaster: () => {},
		setMask: () => {},
		clip: ( sprite: FakeSprite ) => {
			const holder = gpu.container();

			holder.addChild( sprite );

			return { container: holder, release: () => {} };
		},
	};
}

/** Builds a paint API over the fakes. */
function paintApi() {
	const gpu = fakeGpu();
	const layers = fakeLayers( gpu );
	let changes = 0;

	const paint = new PaintApi( {
		gpu: gpu as unknown as GpuContext,
		layers: layers as unknown as LayerTextures,
		canvas: () => ( { width: 100, height: 80 } ),
		onChange: () => void changes++,
	} );

	return { gpu, layers, paint, changes: () => changes };
}

const STAMP = {} as HTMLCanvasElement;

/** Lets the queued flush run. */
const tick = () => new Promise< void >( ( resolve ) => queueMicrotask( resolve ) );

describe( 'PaintApi stroke opacity', () => {
	it( 'stamps every dab at full strength into a buffer, then lays the buffer down once at the stroke opacity', async () => {
		const { gpu, paint } = paintApi();

		paint.stampBrush( 'a', STAMP, 10, 10, 20, '#ff0000', 0.2, false );
		paint.stampBrush( 'a', STAMP, 12, 10, 20, '#ff0000', 0.2, false );
		paint.stampBrush( 'a', STAMP, 14, 10, 20, '#ff0000', 0.2, false );

		// The snapshot of the layer, then three dabs into the buffer -- and nothing
		// into the layer itself yet.
		const snapshot = gpu.draws[ 0 ];

		expect( snapshot.into ).toBe( 'target-2' );
		expect( snapshot.clear ).toBe( true );
		expect( snapshot.sprites[ 0 ].texture.name ).toBe( 'layer-a' );

		const dabs = gpu.draws.slice( 1 );

		expect( dabs ).toHaveLength( 3 );

		for ( const dab of dabs ) {
			expect( dab.into ).toBe( 'target-3' );
			expect( dab.sprites[ 0 ].alpha ).toBe( 1 );
			expect( dab.sprites[ 0 ].tint ).toBe( '#ff0000' );
			expect( dab.sprites[ 0 ].blendMode ).toBe( 'normal' );
		}

		await tick();

		// One flush for the three dabs: the layer is cleared to the snapshot, and the
		// buffer goes over it at 20% -- not 20% three times.
		const flush = gpu.draws.slice( 4 );

		expect( flush ).toHaveLength( 2 );
		expect( flush[ 0 ].into ).toBe( 'layer-a' );
		expect( flush[ 0 ].clear ).toBe( true );
		expect( flush[ 0 ].sprites[ 0 ].texture.name ).toBe( 'target-2' );
		expect( flush[ 1 ].into ).toBe( 'layer-a' );
		expect( flush[ 1 ].sprites[ 0 ].texture.name ).toBe( 'target-3' );
		expect( flush[ 1 ].sprites[ 0 ].alpha ).toBeCloseTo( 0.2 );
		expect( flush[ 1 ].sprites[ 0 ].blendMode ).toBe( 'normal' );
	} );

	it( 'erases at the stroke opacity rather than per dab', async () => {
		const { gpu, paint } = paintApi();

		for ( let i = 0; i < 20; i++ ) {
			paint.stampBrush( 'a', STAMP, 10 + i, 10, 20, '#000000', 0.2, true );
		}

		await tick();

		const dabs = gpu.draws.slice( 1, 21 );

		// Dabs are plain white marks in the buffer; the erasing happens once, below.
		for ( const dab of dabs ) {
			expect( dab.sprites[ 0 ].alpha ).toBe( 1 );
			expect( dab.sprites[ 0 ].tint ).toBeNull();
			expect( dab.sprites[ 0 ].blendMode ).toBe( 'normal' );
		}

		const overlay = gpu.draws[ gpu.draws.length - 1 ];

		expect( overlay.into ).toBe( 'layer-a' );
		expect( overlay.sprites[ 0 ].blendMode ).toBe( 'erase' );
		expect( overlay.sprites[ 0 ].alpha ).toBeCloseTo( 0.2 );
	} );

	it( 'reads the pre-stroke pixels while a stroke is open, so undo captures what was there', () => {
		const { gpu, paint } = paintApi();

		paint.stampBrush( 'a', STAMP, 10, 10, 20, '#000000', 0.5, false );

		const before = gpu.draws.length;

		paint.extractLayerRegion( 'a', { x: 0, y: 0, width: 10, height: 10 } );

		// The region is rendered from the snapshot, not from the layer.
		const read = gpu.draws[ before ];

		expect( read.sprites[ 0 ].texture.name ).toBe( 'target-2' );
	} );

	it( 'frees the snapshot and buffer when the stroke ends, and reports the change', async () => {
		const { gpu, paint, changes } = paintApi();

		paint.stampBrush( 'a', STAMP, 10, 10, 20, '#000000', 0.5, false );
		expect( paint.isStroking ).toBe( true );

		paint.endStroke();

		expect( paint.isStroking ).toBe( false );
		expect( changes() ).toBe( 1 );

		const flushed = gpu.draws.slice( 2 );

		expect( flushed ).toHaveLength( 2 );
		expect( flushed[ 0 ].sprites[ 0 ].texture.destroyed ).toBe( true );
		expect( flushed[ 1 ].sprites[ 0 ].texture.destroyed ).toBe( true );

		await tick();

		// The queued flush finds no stroke and does nothing more.
		expect( gpu.draws ).toHaveLength( 4 );
		expect( changes() ).toBe( 1 );
	} );

	it( 'closes the stroke before any other pixel operation touches the layer', () => {
		const { paint } = paintApi();

		paint.stampBrush( 'a', STAMP, 10, 10, 20, '#000000', 0.5, false );
		paint.fillWithMask( 'a', STAMP, '#00ff00', 1 );

		expect( paint.isStroking ).toBe( false );
	} );

	it( 'starts a fresh stroke when the layer or the mode changes', () => {
		const { paint, gpu } = paintApi();

		paint.stampBrush( 'a', STAMP, 10, 10, 20, '#000000', 0.5, false );
		paint.stampBrush( 'a', STAMP, 10, 10, 20, '#000000', 0.5, true );

		// Two snapshots were taken: one per stroke.
		const snapshots = gpu.draws.filter(
			( draw ) => draw.clear && draw.sprites[ 0 ].texture.name === 'layer-a'
		);

		expect( snapshots ).toHaveLength( 2 );
	} );
} );
