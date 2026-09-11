import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readDesktopImage } from '../../src/hosts/desktop-mode/image-payload';
import { registerDropTarget } from '../../src/hosts/desktop-mode/drop-target';
import { attachFileDrop } from '../../src/hosts/desktop-mode/file-drop';
import { readDroppedImage, WP_MEDIA_TYPE } from '../../src/hosts/desktop-mode/drop-payload';
import type { DesktopApi, DragPayloadLike } from '../../src/hosts/desktop-mode/desktop-api';
import { toast } from '../../src/platform';

vi.mock( '../../src/platform', () => ( { toast: vi.fn() } ) );

function installShell( api: DesktopApi ): void {
	Object.defineProperty( window, 'wp', { configurable: true, value: { os: { isActive: () => true, ...api } } } );
}

function transfer( data: Record< string, string > = {}, files: File[] = [] ): DataTransfer {
	return { types: [ ...Object.keys( data ), ...( files.length ? [ 'Files' ] : [] ) ], files,
		getData: ( type: string ) => data[ type ] ?? '', dropEffect: 'none' } as unknown as DataTransfer;
}

beforeEach( () => { installShell( {} ); } );
afterEach( () => { vi.restoreAllMocks(); vi.clearAllMocks(); document.body.replaceChildren(); installShell( {} ); } );

describe( 'desktop image identities', () => {
	it.each( [
		{ type: 'desktop-file', data: { bridgePayload: { kind: 'attachment', id: 42, mime: 'image/png' } } },
		{ type: 'desktop-file', data: { placement: { file: { type: 'attachment', ref: '42' } } } },
		{ type: 'shortcut', data: { kind: 'media', ref: '42' } },
		{ type: 'attachment', data: { id: 42 } },
	] )( 'reads an attachment from $type', ( payload ) => {
		expect( readDesktopImage( payload ) ).toEqual( { kind: 'attachment', id: 42 } );
	} );

	it( 'keeps desktop storage ids distinct from media ids', () => {
		expect( readDesktopImage( { type: 'desktop-file', data: {
			placement: { file: { type: 'upload', ref: '42', mime: 'image/png', title: 'Photo' } },
		} } ) ).toEqual( { kind: 'upload', id: 42, title: 'Photo' } );
	} );

	it.each( [
		{ kind: 'post', id: 42 }, { kind: 'attachment', id: -1 },
		{ kind: 'attachment', id: 1.5 }, { kind: 'attachment', id: 'NaN' },
		{ kind: 'attachment', id: 42, mime: 'video/mp4' },
		{ kind: 'upload', fileId: 42, mime: 'application/pdf' },
		{ kind: 'upload', fileId: 42 },
	] )( 'declines invalid or non-image records: %j', ( bridgePayload ) => {
		expect( readDesktopImage( { type: 'desktop-file', data: { bridgePayload } } ) ).toBeNull();
	} );
} );

describe( 'desktop drop target', () => {
	type Target = Parameters< NonNullable< NonNullable< DesktopApi['dragManager'] >['registerDropTarget'] > >[0];
	let targets: Target[];
	let release: ReturnType< typeof vi.fn >;
	beforeEach( () => {
		targets = [];
		release = vi.fn();
		const manager = { registerDropTarget( target: Target ) {
			expect( this ).toBe( manager );
			targets.push( target ); return release;
		} };
		installShell( { dragManager: manager } );
	} );

	it( 'adds a wallpaper attachment at the drop coordinates', async () => {
		const drop = vi.fn();
		const cleanup = registerDropTarget( document.createElement( 'div' ), drop );
		const payload: DragPayloadLike = { type: 'desktop-file', data: { placement: { file: { type: 'attachment', ref: '42' } } } };
		expect( targets[0].accept( payload ) ).toBe( true );
		await targets[0].onDrop( { payload }, { clientX: 120, clientY: 170 } );
		expect( drop ).toHaveBeenCalledWith( { attachmentId: 42, clientX: 120, clientY: 170 } );
		cleanup?.(); expect( release ).toHaveBeenCalledOnce();
	} );

	it( 'registers independent targets for two windows', () => {
		registerDropTarget( document.createElement( 'div' ), vi.fn() );
		registerDropTarget( document.createElement( 'div' ), vi.fn() );
		expect( targets[0].id ).not.toBe( targets[1].id );
	} );

	it( 'resolves stored images only on drop, then imports the attachment', async () => {
		const drop = vi.fn();
		const addUploadToMediaLibrary = vi.fn().mockResolvedValue( { attachmentId: 84, title: 'Stored photo' } );
		installShell( { dragManager: { registerDropTarget: ( t ) => { targets.push( t ); return release; } }, files: { rest: { addUploadToMediaLibrary } } } );
		registerDropTarget( document.createElement( 'div' ), drop );
		const payload = { type: 'desktop-file', data: { bridgePayload: { kind: 'upload', fileId: 42, mime: 'image/png' } } };
		expect( targets[0].accept( payload ) ).toBe( true );
		expect( addUploadToMediaLibrary ).not.toHaveBeenCalled();
		await targets[0].onDrop( { payload }, { clientX: 10, clientY: 20 } );
		expect( addUploadToMediaLibrary ).toHaveBeenCalledWith( 42 );
		expect( drop ).toHaveBeenCalledWith( { attachmentId: 84, title: 'Stored photo', clientX: 10, clientY: 20 } );
	} );

	it( 'does not deliver an asynchronous storage drop into a closed editor', async () => {
		let resolve!: ( value: { attachmentId: number; title: string } ) => void;
		installShell( { dragManager: { registerDropTarget: ( t ) => { targets.push( t ); return release; } }, files: { rest: {
			addUploadToMediaLibrary: () => new Promise( ( done ) => { resolve = done; } ),
		} } } );
		const drop = vi.fn();
		const cleanup = registerDropTarget( document.createElement( 'div' ), drop );
		const pending = targets[0].onDrop( { payload: { type: 'desktop-file', data: {
			bridgePayload: { kind: 'upload', fileId: 42, mime: 'image/png' },
		} } }, { clientX: 10, clientY: 20 } );
		cleanup?.(); resolve( { attachmentId: 84, title: 'Photo' } ); await pending;
		expect( drop ).not.toHaveBeenCalled();
	} );
} );

describe( 'browser image data', () => {
	it( 'prefers file bytes over thumbnail URLs', () => {
		const file = new File( [ 'pixels' ], 'photo.png', { type: 'image/png' } );
		expect( readDroppedImage( transfer( { 'text/uri-list': 'https://example.test/thumb.png' }, [ file ] ) ) ).toEqual( { file } );
	} );
	it( 'reads the Media Library attachment record', () => {
		expect( readDroppedImage( transfer( { [ WP_MEDIA_TYPE ]: JSON.stringify( { id: 42, mime: 'image/png' } ) } ) ) ).toEqual( { attachmentId: 42 } );
	} );
	it( 'finds an image after a non-image link in a URI list', () => {
		expect( readDroppedImage( transfer( { 'text/uri-list': '# comment\nhttps://example.test/page\nhttps://example.test/photo.png' } ) ) ).toEqual( { url: 'https://example.test/photo.png' } );
	} );
	it( 'decodes HTML entities in image URLs, including extensionless sources', () => {
		expect( readDroppedImage( transfer( { 'text/html': '<img src="https://example.test/image?id=42&amp;size=full">' } ) ) ).toEqual( { url: 'https://example.test/image?id=42&size=full' } );
	} );
	it( 'accepts generated images carried as data URLs', () => {
		expect( readDroppedImage( transfer( { 'text/plain': 'data:image/png;base64,abc' } ) ) ).toEqual( { url: 'data:image/png;base64,abc' } );
	} );
} );

describe( 'native browser drop routing', () => {
	let root: HTMLElement;
	let drop: ReturnType< typeof vi.fn >;
	let cleanup: () => void;
	let hit: Element;
	beforeEach( () => {
		root = document.createElement( 'div' ); document.body.append( root ); hit = root;
		vi.spyOn( root, 'getBoundingClientRect' ).mockReturnValue( new DOMRect( 100, 100, 300, 300 ) );
		Object.defineProperty( document, 'elementFromPoint', { configurable: true, value: vi.fn( () => hit ) } );
		drop = vi.fn(); cleanup = attachFileDrop( root, drop );
	} );
	afterEach( () => cleanup() );
	function fire( type: string, data: DataTransfer, x = 150 ): Event {
		const event = new MouseEvent( type, { bubbles: true, cancelable: true, clientX: x, clientY: 150 } );
		Object.defineProperty( event, 'dataTransfer', { value: data } );
		root.dispatchEvent( event ); return event;
	}
	it( 'allows a file drop and imports it exactly once', () => {
		const file = new File( [ 'pixels' ], 'photo.png', { type: 'image/png' } );
		const data = transfer( {}, [ file ] );
		expect( fire( 'dragover', data ).defaultPrevented ).toBe( true );
		expect( data.dropEffect ).toBe( 'copy' );
		expect( fire( 'drop', data ).defaultPrevented ).toBe( true );
		expect( drop ).toHaveBeenCalledOnce();
		expect( drop ).toHaveBeenCalledWith( { file, clientX: 150, clientY: 150 } );
	} );
	it( 'uses the active bridge when the browser strips cross-frame data', () => {
		installShell( { dragBridge: { getPayload: () => ( { kind: 'attachment', id: 42, title: 'Photo' } ) } } );
		expect( fire( 'dragover', transfer() ).defaultPrevented ).toBe( true );
		fire( 'drop', transfer() );
		expect( drop ).toHaveBeenCalledWith( { attachmentId: 42, title: 'Photo', clientX: 150, clientY: 150 } );
	} );
	it( 'does not steal a drop from an overlapping window', () => {
		hit = document.createElement( 'div' ); document.body.append( hit );
		expect( fire( 'drop', transfer( { 'text/uri-list': '/photo.png' } ) ).defaultPrevented ).toBe( false );
		expect( drop ).not.toHaveBeenCalled();
	} );
	it( 'leaves unrelated payloads and out-of-bounds drops alone', () => {
		expect( fire( 'drop', transfer( { 'application/x-other': 'data' } ) ).defaultPrevented ).toBe( false );
		expect( fire( 'drop', transfer( { 'text/uri-list': '/photo.png' } ), 500 ).defaultPrevented ).toBe( false );
		expect( drop ).not.toHaveBeenCalled(); expect( toast ).not.toHaveBeenCalled();
	} );
	it( 'removes listeners and highlights on teardown', () => {
		const data = transfer( { 'text/uri-list': '/photo.png' } );
		fire( 'dragover', data ); expect( root.classList.contains( 'is-drop-target' ) ).toBe( true );
		cleanup(); fire( 'drop', data );
		expect( drop ).not.toHaveBeenCalled(); expect( root.classList.contains( 'is-drop-target' ) ).toBe( false );
	} );
} );
