/** Image identities carried by the desktop's pointer and cross-frame drags. */

import { __ } from '../../i18n';
import { desktop } from './desktop-api';
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

/**
 * Whether this shell can turn an image into something the editor opens.
 *
 * An attachment always can. A file stored on the desktop has to become one first, and
 * only a shell that offers the conversion can do that -- so offering the drop without
 * it would highlight a target that then does nothing.
 *
 * @param image The image a drag carries.
 */
export function canResolveDesktopImage( image: DesktopImage ): boolean {
	return 'attachment' === image.kind ||
		!! desktop()?.files?.rest?.addUploadToMediaLibrary;
}

/**
 * The attachment an image opens as, adding a desktop file to the Media Library first.
 *
 * The editor reads and saves attachments, so a photo that lives only on the desktop is
 * filed into the library at drop time -- the same thing the shell does when one is
 * dropped onto a post.
 *
 * @param image The image a drag carries.
 * @return The attachment id and its title.
 */
export async function resolveDesktopImage(
	image: DesktopImage
): Promise< { attachmentId: number; title?: string } > {
	if ( 'attachment' === image.kind ) {
		return { attachmentId: image.id, title: image.title };
	}

	const rest = desktop()?.files?.rest;

	if ( ! rest?.addUploadToMediaLibrary ) {
		throw new Error( __( 'This desktop cannot add files to the Media Library.' ) );
	}

	// Called on the client rather than pulled off it, in case the shell's method
	// reads its own `this`.
	const attachment = await rest.addUploadToMediaLibrary( image.id );

	return { attachmentId: attachment.attachmentId, title: attachment.title || image.title };
}
