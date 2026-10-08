import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	attachmentFrom,
	postFrom,
	registerIconDrop,
} from '../../src/hosts/desktop-mode/icon-drop';
import type { DesktopApi } from '../../src/hosts/desktop-mode/desktop-api';
import { openInDesktop, openPostInDesktop } from '../../src/hosts/desktop-mode/open-window';
import { toast } from '../../src/platform';

vi.mock( '../../src/platform', () => ( { toast: vi.fn() } ) );
vi.mock( '../../src/hosts/desktop-mode/open-window', () => ( {
	openInDesktop: vi.fn( () => true ),
	openPostInDesktop: vi.fn( async () => true ),
} ) );

describe( 'attachmentFrom', () => {
	it( 'reads a media tile dragged by ref', () => {
		expect( attachmentFrom( { kind: 'attachment', ref: '42' } ) ).toBe( 42 );
	} );

	it( 'reads the site window spelling of the same thing', () => {
		expect( attachmentFrom( { kind: 'media', ref: '42' } ) ).toBe( 42 );
	} );

	it( 'reads a payload that named the id rather than a ref', () => {
		expect( attachmentFrom( { id: 42 } ) ).toBe( 42 );
		expect( attachmentFrom( { mediaId: 42 } ) ).toBe( 42 );
	} );

	it( 'declines a payload that is some other kind of thing', () => {
		expect( attachmentFrom( { kind: 'post', ref: '42' } ) ).toBe( 0 );
		expect( attachmentFrom( { kind: 'user', ref: '42' } ) ).toBe( 0 );
	} );

	it( 'declines a payload carrying no id at all', () => {
		expect( attachmentFrom( {} ) ).toBe( 0 );
		expect( attachmentFrom( { kind: 'attachment', ref: 'nonsense' } ) ).toBe( 0 );
	} );
} );

describe( 'postFrom', () => {
	it( 'reads any post type, because the desktop calls them all posts', () => {
		expect( postFrom( { kind: 'post', ref: '2087' } ) ).toBe( 2087 );
	} );

	it( 'declines anything that is not a post', () => {
		expect( postFrom( { kind: 'attachment', ref: '2087' } ) ).toBe( 0 );
		expect( postFrom( { kind: 'user', ref: '2087' } ) ).toBe( 0 );
		expect( postFrom( {} ) ).toBe( 0 );
	} );

	it( 'declines a post with no usable id', () => {
		expect( postFrom( { kind: 'post', ref: '0' } ) ).toBe( 0 );
		expect( postFrom( { kind: 'post' } ) ).toBe( 0 );
	} );
} );

describe( 'dropping a wallpaper tile on the icon', () => {
	type Handler = Parameters< NonNullable< NonNullable< DesktopApi['files'] >['registerTilePayloadHandler'] > >[1];
	let handlers: Map< string, Handler >;
	let addUpload: ReturnType< typeof vi.fn >;

	const icon = { placement: { file: { type: 'shortcut', ref: 'lienzo' } } };
	const upload = ( mime = 'image/jpeg' ) => ( {
		placement: { file: { type: 'upload', ref: '17', mime, title: 'Beach' } },
	} );

	beforeEach( () => {
		handlers = new Map();
		addUpload = vi.fn( async () => ( { attachmentId: 99, title: 'Beach' } ) );
		delete ( window as { __lienzoDesktop?: unknown } ).__lienzoDesktop;
		window.lienzoConfig = { supportedMimes: [ 'image/jpeg', 'image/png' ] } as typeof window.lienzoConfig;
		Object.defineProperty( window, 'wp', { configurable: true, value: { os: {
			isActive: () => true,
			files: {
				rest: { addUploadToMediaLibrary: addUpload },
				registerTilePayloadHandler( type: string, handler: Handler ) {
					handlers.set( type, handler );
					return () => {};
				},
			},
		} } } );
		registerIconDrop();
	} );

	afterEach( () => {
		vi.clearAllMocks();
	} );

	it( 'listens for desktop files as well as attachments and shortcuts', () => {
		expect( [ ...handlers.keys() ] ).toEqual( [ 'attachment', 'shortcut', 'desktop-file' ] );
	} );

	it( 'only claims its own icon', () => {
		const handler = handlers.get( 'desktop-file' )!;
		expect( handler.appliesTo( icon ) ).toBe( true );
		expect( handler.appliesTo( { placement: { file: { type: 'shortcut', ref: 'code-blue' } } } ) ).toBe( false );
	} );

	it( 'accepts a photo saved to the desktop, and adds it to the library on drop', async () => {
		const handler = handlers.get( 'desktop-file' )!;
		expect( handler.accept( upload(), icon ) ).toBe( true );

		handler.onDrop( { payload: { type: 'desktop-file', data: upload() } }, { clientX: 0, clientY: 0 }, icon );
		await vi.waitFor( () => expect( openInDesktop ).toHaveBeenCalledWith( 99 ) );
		expect( addUpload ).toHaveBeenCalledWith( 17 );
	} );

	it( 'opens a Media Library item pinned to the desktop without re-uploading it', async () => {
		const data = { placement: { file: { type: 'attachment', ref: '42', mime: 'image/png' } } };
		const handler = handlers.get( 'desktop-file' )!;
		expect( handler.accept( data, icon ) ).toBe( true );

		handler.onDrop( { payload: { type: 'desktop-file', data } }, { clientX: 0, clientY: 0 }, icon );
		await vi.waitFor( () => expect( openInDesktop ).toHaveBeenCalledWith( 42 ) );
		expect( addUpload ).not.toHaveBeenCalled();
	} );

	it( 'opens the image of a post placed on the desktop', async () => {
		const data = { placement: { file: { type: 'post', ref: '2087' } } };
		const handler = handlers.get( 'desktop-file' )!;
		expect( handler.accept( data, icon ) ).toBe( true );

		handler.onDrop( { payload: { type: 'desktop-file', data } }, { clientX: 0, clientY: 0 }, icon );
		await vi.waitFor( () => expect( openPostInDesktop ).toHaveBeenCalledWith( 2087 ) );
	} );

	it( 'refuses files the editor cannot open', () => {
		const handler = handlers.get( 'desktop-file' )!;
		expect( handler.accept( upload( 'application/pdf' ), icon ) ).toBe( false );
		expect( handler.accept( upload( 'image/x-unsupported' ), icon ) ).toBe( false );
		expect( handler.accept( { placement: { file: { type: 'folder', ref: '3' } } }, icon ) ).toBe( false );
	} );

	it( 'refuses a desktop upload on a shell that cannot file it into the library', () => {
		( window.wp as { os: { files: { rest?: unknown } } } ).os.files.rest = undefined;
		expect( handlers.get( 'desktop-file' )!.accept( upload(), icon ) ).toBe( false );
	} );

	it( 'says so when the upload cannot be added', async () => {
		addUpload.mockRejectedValueOnce( new Error( 'Quota exceeded' ) );
		handlers.get( 'desktop-file' )!.onDrop(
			{ payload: { type: 'desktop-file', data: upload() } }, { clientX: 0, clientY: 0 }, icon
		);
		await vi.waitFor( () => expect( toast ).toHaveBeenCalledWith( 'Quota exceeded', 'error' ) );
		expect( openInDesktop ).not.toHaveBeenCalled();
	} );

	it( 'still opens an attachment dragged as a shortcut from the site window', () => {
		const handler = handlers.get( 'shortcut' )!;
		expect( handler.accept( { kind: 'media', ref: '42' }, icon ) ).toBe( true );
		expect( handler.accept( { kind: 'user', ref: '42' }, icon ) ).toBe( false );
	} );
} );
