/**
 * Loading source pixels into something WebGL can sample without tainting.
 *
 * This is the single most failure-prone step in the whole editor, so it is isolated
 * here with an explicit fallback chain.
 *
 * A WebGL context that samples a cross-origin texture becomes *tainted*, and a
 * tainted context makes both `extract.pixels()` (which draws the histogram) and
 * `toBlob()` (which saves the result) throw a SecurityError. On a stock WordPress
 * site uploads are same-origin and none of this matters. On a site using a CDN or a
 * media-offload plugin, uploads come from another host and the naive path breaks --
 * which is precisely the site where the failure would otherwise be discovered by a
 * user, at save time, after they had already done the work.
 */

import type { RestClient } from './rest';
import type { MediaPayload } from '../types';

/** A loaded image plus whatever cleanup its loading strategy needs. */
export interface LoadedImage {
	image: HTMLImageElement;
	/** Releases any object URL created for the fallback path. */
	release: () => void;
	/** Which strategy succeeded, for diagnostics. */
	via: 'direct' | 'proxy';
}

/**
 * Loads an image element from a URL with CORS explicitly requested.
 *
 * Requesting `crossOrigin = 'anonymous'` is what makes this safe rather than
 * hopeful: with it set, a server that does not send `Access-Control-Allow-Origin`
 * causes the *load* to fail instead of silently succeeding and poisoning the canvas
 * later. So a resolved promise here is a guarantee the texture is usable.
 *
 * @param url Image URL.
 */
function loadElement( url: string ): Promise< HTMLImageElement > {
	return new Promise( ( resolve, reject ) => {
		const image = new Image();

		image.crossOrigin = 'anonymous';
		image.decoding = 'async';

		image.addEventListener( 'load', () => resolve( image ), { once: true } );
		image.addEventListener(
			'error',
			() => reject( new Error( `Could not load image from ${ url }` ) ),
			{ once: true }
		);

		image.src = url;
	} );
}

/**
 * Loads an image by URL, for a drag that carried a link rather than bytes.
 *
 * Dragging a thumbnail out of the Media Library is a plain HTML5 drag: the browser
 * offers `text/uri-list`, not a file. Same-origin uploads load cleanly; a CDN that
 * sends no CORS headers fails here rather than silently tainting the canvas and
 * breaking every later save, which is the whole point of asking for CORS up front.
 *
 * @param url Image URL.
 * @return The loaded image and its cleanup.
 * @throws {Error} When the image cannot be loaded, or could not be used if it were.
 */
export async function loadImageUrl( url: string ): Promise< LoadedImage > {
	const image = await loadElement( url );

	return { image, release: () => {}, via: 'direct' };
}

/**
 * Loads an image dragged in from outside the browser.
 *
 * A blob URL is same-origin by definition, so this path can never taint the canvas --
 * which is why a file dropped from the desktop needs none of the fallback machinery an
 * attachment does. The URL is revoked once the pixels are in a texture; holding one
 * open pins the whole file in memory for the life of the document.
 *
 * @param file File from a drop or a file input.
 * @return The loaded image and its cleanup.
 * @throws {Error} When the file is not an image the browser can decode.
 */
export async function loadImageFile( file: File ): Promise< LoadedImage > {
	if ( ! file.type.startsWith( 'image/' ) ) {
		throw new Error( `${ file.name } is not an image.` );
	}

	const url = URL.createObjectURL( file );

	try {
		const image = await loadElement( url );

		return { image, release: () => URL.revokeObjectURL( url ), via: 'direct' };
	} catch {
		URL.revokeObjectURL( url );

		throw new Error( `${ file.name } could not be decoded.` );
	}
}

/**
 * Loads an image from bytes already in hand.
 *
 * A blob URL is same-origin by definition, so this can never taint the canvas. The URL
 * is revoked with the image; holding one open pins the bytes for the life of the
 * document.
 *
 * @param blob Encoded image.
 * @return The loaded image and its cleanup.
 * @throws {Error} When the bytes are not an image the browser can decode.
 */
export async function loadImageBlob( blob: Blob ): Promise< LoadedImage > {
	const url = URL.createObjectURL( blob );

	try {
		const image = await loadElement( url );

		return { image, release: () => URL.revokeObjectURL( url ), via: 'proxy' };
	} catch ( error ) {
		URL.revokeObjectURL( url );
		throw error;
	}
}

/**
 * Loads an attachment's full-size pixels, falling back to the REST byte proxy.
 *
 * @param payload Media payload from `GET /media/<id>`.
 * @param client  REST client, used only for the fallback.
 * @return The loaded image and its cleanup.
 * @throws {Error} When neither strategy works.
 */
export async function loadSourceImage(
	payload: MediaPayload,
	client: RestClient
): Promise< LoadedImage > {
	try {
		const image = await loadElement( payload.url );

		return { image, release: () => {}, via: 'direct' };
	} catch {
		// Either the file is genuinely missing, or -- far more likely -- it is served
		// from a CDN that does not send CORS headers. Both are handled the same way:
		// pull the bytes through our own origin, where a blob URL can never taint.
	}

	const blob = await client.getSourceBlob( payload.sourceUrl );
	const objectUrl = URL.createObjectURL( blob );

	try {
		const image = await loadElement( objectUrl );

		return {
			image,
			release: () => URL.revokeObjectURL( objectUrl ),
			via: 'proxy',
		};
	} catch ( error ) {
		URL.revokeObjectURL( objectUrl );
		throw error;
	}
}
