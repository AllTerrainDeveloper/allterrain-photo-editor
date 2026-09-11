/**
 * Reading what was dropped.
 *
 * A drop can carry bytes, a WordPress attachment record, a bare id, or just a URL. The
 * order they are tried in matters: an attachment id gets the CORS-safe load path, so it
 * is always preferred over a URL that happens to point at the same file.
 */

import type { DroppedImage } from '../../editor';
import { ATTACHMENT_TYPE } from '../media-drag';

/** Image URL patterns worth accepting from a native drag. */
const IMAGE_URL = /\.(?:jpe?g|png|gif|webp|avif|bmp)(?:\?|#|$)/i;

/**
 * Reads whatever an image drag offers, in order of usefulness.
 *
 * Three quite different things arrive at this one handler:
 *
 * - **Files**, from Finder or Explorer. No upload needed; the bytes go straight into a
 *   texture.
 * - **An attachment id**, when the drag came from somewhere that marks its markup up --
 *   WordPress puts `wp-image-<id>` on inserted images, and the media grid puts
 *   `data-id` on its tiles. Worth digging for: with an id the pixels load through the
 *   CORS-safe path, and a CDN-served file falls back to the byte proxy instead of
 *   tainting the canvas.
 * - **A URL**, which is what dragging a thumbnail out of the Media Library actually
 *   gives you. `text/uri-list` and nothing else.
 *
 * The last of those is the common case and the one this handler originally missed
 * entirely, so dragging from the Media Library did nothing at all.
 *
 * @param transfer The drag's data.
 * @return What to load, or null when the drag holds no image.
 */
export function readDroppedImage(
	transfer: DataTransfer | null
): Omit< DroppedImage, 'clientX' | 'clientY' > | null {
	if ( ! transfer ) {
		return null;
	}

	const file = Array.from( transfer.files ).find( ( entry ) =>
		entry.type.startsWith( 'image/' )
	);

	if ( file ) {
		return { file };
	}

	// Our own type first: the Media Library tags its drags with the attachment id, so
	// there is nothing to infer.
	const tagged = Number( transfer.getData( ATTACHMENT_TYPE ) );

	if ( Number.isSafeInteger( tagged ) && tagged > 0 ) {
		return { attachmentId: tagged };
	}

	// Then OpenStation's, which is what a Media Library tile actually carries: the
	// enhancement makes every `.attachment` draggable and writes the whole record as
	// JSON. This is the canonical contract for a WordPress media drag and reading it
	// beats inferring an id from markup, which is what the fallbacks below do.
	const record = readMediaRecord( transfer );

	if ( record ) {
		return record;
	}

	const html = transfer.getData( 'text/html' );
	const id =
		/wp-image-(\d+)/.exec( html )?.[ 1 ] ??
		/data-id=["']?(\d+)/.exec( html )?.[ 1 ];

	if ( id ) {
		return { attachmentId: Number( id ) };
	}

	// `text/uri-list` may hold several lines, and comment lines start with a hash.
	const list = transfer.getData( 'text/uri-list' ) || transfer.getData( 'text/plain' );
	const url = list
		.split( /[\r\n]+/ )
		.map( ( line ) => line.trim() )
		.find( ( line ) => line && ! line.startsWith( '#' ) &&
			( IMAGE_URL.test( line ) || /^data:image\//i.test( line ) || /^blob:/i.test( line ) ) );

	if ( url ) {
		return { url };
	}

	// A dragged `<img>` offers markup even when it offers no usable URL list.
	const src = html ? new DOMParser().parseFromString( html, 'text/html' )
		.querySelector( 'img[src]' )?.getAttribute( 'src' ) : null;

	return src ? { url: src } : null;
}

/** The type OpenStation's Media Library enhancement writes its record to. */
export const WP_MEDIA_TYPE = 'application/x-wp-media-attachment';

/**
 * Reads OpenStation's media record off a drag.
 *
 * @param transfer The drag's data.
 * @return The attachment, or null when the drag carries no record.
 */
function readMediaRecord(
	transfer: DataTransfer
): Omit< DroppedImage, 'clientX' | 'clientY' > | null {
	const raw = transfer.getData( WP_MEDIA_TYPE );

	if ( ! raw ) {
		return null;
	}

	try {
		const record = JSON.parse( raw ) as {
			id?: number;
			url?: string;
			title?: string;
			mime?: string;
		};

		// A video or a PDF is a perfectly reasonable thing to drag; it is just not
		// something this editor can put on a canvas.
		if ( record.mime && ! record.mime.startsWith( 'image/' ) ) {
			return null;
		}

		if ( Number( record.id ) > 0 ) {
			return { attachmentId: Number( record.id ), title: record.title };
		}

		return record.url ? { url: record.url, title: record.title } : null;
	} catch {
		return null;
	}
}
