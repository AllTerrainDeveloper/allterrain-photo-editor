/** Image identities carried by the desktop's pointer and cross-frame drags. */

import type { DragPayloadLike } from './desktop-api';

export interface DesktopImage {
	kind: 'attachment' | 'upload';
	id: number;
	title?: string;
}

/** Read a bridge record without confusing a post or a storage id with an attachment. */
export function readBridgeImage( record: unknown ): DesktopImage | null {
	if ( ! record || typeof record !== 'object' ) {
		return null;
	}

	const data = record as Record< string, unknown >;
	const kind = data.kind;
	if ( kind !== 'attachment' && kind !== 'media' && kind !== 'upload' ) {
		return null;
	}

	const mime = data.mime;
	if ( typeof mime === 'string' && mime && (
		! mime.startsWith( 'image/' ) ||
		( window.lienzoConfig && ! window.lienzoConfig.supportedMimes.includes( mime ) )
	) ) {
		return null;
	}

	// A stored file needs an image MIME; an attachment can be checked by our media route.
	if ( kind === 'upload' && ( typeof mime !== 'string' || ! mime ) ) {
		return null;
	}

	const id = Number( kind === 'upload' ? data.fileId ?? data.ref : data.id ?? data.ref ?? data.mediaId );
	if ( ! Number.isSafeInteger( id ) || id <= 0 ) {
		return null;
	}

	return {
		kind: kind === 'upload' ? 'upload' : 'attachment',
		id,
		...( typeof data.title === 'string' ? { title: data.title } : {} ),
	};
}

/** Read current wallpaper, Explorer and legacy attachment payloads. */
export function readDesktopImage( payload: DragPayloadLike ): DesktopImage | null {
	const data = payload.data ?? {};
	if ( data.bridgePayload ) {
		return readBridgeImage( data.bridgePayload );
	}
	if ( payload.type === 'desktop-file' ) {
		const placement = data.placement as { file?: Record< string, unknown > } | undefined;
		const file = placement?.file;
		return file ? readBridgeImage( { ...file, kind: file.type } ) : null;
	}
	if ( payload.type === 'shortcut' || payload.type === 'attachment' ) {
		return readBridgeImage( { ...data, kind: data.kind ?? payload.type } );
	}
	return null;
}
