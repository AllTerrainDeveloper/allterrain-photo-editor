/**
 * Typed client for the `lienzo/v1` routes.
 */

import { request } from '../platform';
import type { Recipe } from '../model/recipe';
import type {
	LienzoConfig,
	MediaPayload,
	PostImage,
	Preset,
	SaveResult,
} from '../types';

/** One layer's pixels, ready to travel with a save. */
export interface LayerUpload {
	id: string;
	/** PNG-encoded pixels, at the layer's native size. */
	blob: Blob;
}

/** An error carrying the server's own message and code. */
export class RestError extends Error {
	public readonly code: string;

	public readonly status: number;

	constructor( message: string, code: string, status: number ) {
		super( message );
		this.name = 'RestError';
		this.code = code;
		this.status = status;
	}
}

/**
 * Turns a failed response into an error carrying the server's wording.
 *
 * WordPress REST errors are `{ code, message, data: { status } }`. Surfacing the
 * server's message matters here: "You are not allowed to edit this image" and "The
 * original image file is not readable on disk" need very different responses from
 * the user, and a generic "request failed" tells them nothing.
 *
 * @param response Failed response.
 */
async function toError( response: Response ): Promise< RestError > {
	let message = `Request failed with status ${ response.status }.`;
	let code = 'lienzo_http_error';

	try {
		const body = await response.json();

		if ( body && typeof body === 'object' ) {
			if ( typeof body.message === 'string' ) {
				message = body.message;
			}
			if ( typeof body.code === 'string' ) {
				code = body.code;
			}
		}
	} catch {
		// A non-JSON body (a PHP fatal, an HTML error page) leaves the defaults.
	}

	return new RestError( message, code, response.status );
}

/**
 * Client for AllTerrain Photo Editor's REST routes.
 */
export class RestClient {
	private config: LienzoConfig;

	/**
	 * @param config Runtime configuration from `window.lienzoConfig`.
	 */
	constructor( config: LienzoConfig ) {
		this.config = config;
	}

	/** Headers every authenticated call needs. */
	private headers( extra: Record< string, string > = {} ): Record< string, string > {
		return { 'X-WP-Nonce': this.config.restNonce, ...extra };
	}

	/**
	 * Fetches everything needed to open an image.
	 *
	 * @param attachmentId Attachment to open.
	 */
	async getMedia( attachmentId: number ): Promise< MediaPayload > {
		const response = await request( `${ this.config.restUrl }media/${ attachmentId }`, {
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as MediaPayload;
	}

	/**
	 * Uploads a rendered image and creates a new attachment.
	 *
	 * Sent as multipart rather than JSON with a base64 payload: a full-resolution
	 * PNG can be tens of megabytes, and base64 would inflate that by a third before
	 * it ever reached the wire.
	 *
	 * The painted layers ride along as PNGs of their own, one per layer, so the copy
	 * can be opened again with its layers intact rather than baked in. Without them
	 * the server stores the copy flattened, exactly as it did before they travelled.
	 *
	 * @param attachmentId Attachment the edit was rendered from.
	 * @param blob         Encoded image.
	 * @param recipe       The edit, for storage alongside the result.
	 * @param layers       Optional. Each raster layer's pixels, keyed by layer id.
	 */
	async saveRender(
		attachmentId: number,
		blob: Blob,
		recipe: Recipe,
		layers: LayerUpload[] = []
	): Promise< SaveResult > {
		const body = new FormData();

		// The server renames this from the source attachment; the name here only has
		// to be present and have a plausible extension.
		body.append( 'file', blob, 'render' );
		body.append( 'recipe', JSON.stringify( recipe ) );

		for ( const layer of layers ) {
			body.append( `layers[${ layer.id }]`, layer.blob, `${ layer.id }.png` );
		}

		const response = await request(
			`${ this.config.restUrl }media/${ attachmentId }/render`,
			{
				method: 'POST',
				credentials: 'same-origin',
				headers: this.headers(),
				body,
			}
		);

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as SaveResult;
	}

	/** Lists the current user's presets. */
	async getPresets(): Promise< Preset[] > {
		const response = await request( `${ this.config.restUrl }presets`, {
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as Preset[];
	}

	/**
	 * Saves the current edit as a named preset.
	 *
	 * @param name   Display name.
	 * @param recipe The edit to derive it from.
	 */
	async createPreset( name: string, recipe: Recipe ): Promise< Preset > {
		const response = await request( `${ this.config.restUrl }presets`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: this.headers( { 'Content-Type': 'application/json' } ),
			body: JSON.stringify( { name, recipe: JSON.stringify( recipe ) } ),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as Preset;
	}

	/**
	 * Deletes a preset.
	 *
	 * @param id Preset identifier.
	 */
	async deletePreset( id: string ): Promise< void > {
		const response = await request( `${ this.config.restUrl }presets/${ id }`, {
			method: 'DELETE',
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}
	}

	/**
	 * Streams the original bytes from the same origin as wp-admin.
	 *
	 * Only used when a direct load tainted or failed -- see `loadSourceImage()`.
	 *
	 * @param sourceUrl Absolute URL of the `/source` route.
	 */
	async getSourceBlob( sourceUrl: string ): Promise< Blob > {
		return this.getBlob( sourceUrl );
	}

	/**
	 * Fetches bytes from one of this plugin's routes, with the nonce along.
	 *
	 * Through `fetch` rather than an `<img>` because a REST route without the nonce is
	 * an anonymous request, and anonymous requests may not read a layer's pixels.
	 *
	 * @param url Absolute URL of the route.
	 */
	async getBlob( url: string ): Promise< Blob > {
		const response = await request( url, {
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return response.blob();
	}

	/**
	 * Finds the image a post is about.
	 *
	 * @param postId Post to look at.
	 * @throws {Error} When the post has no editable image, or is not this user's to
	 *                 edit.
	 */
	async getPostImage( postId: number ): Promise< PostImage > {
		const response = await request(
			`${ this.config.restUrl }posts/${ postId }/image`,
			{ credentials: 'same-origin', headers: this.headers() }
		);

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as PostImage;
	}

	/**
	 * Points a post's image at an attachment.
	 *
	 * @param postId       Post to update.
	 * @param attachmentId Attachment it should point at.
	 * @param slot         Which image: 'thumbnail' or 'gallery'.
	 * @param replacing    Attachment being replaced, for a gallery slot.
	 * @throws {Error} When the post could not be updated.
	 */
	async attachToPost(
		postId: number,
		attachmentId: number,
		slot: string,
		replacing = 0
	): Promise< void > {
		const response = await request(
			`${ this.config.restUrl }posts/${ postId }/image`,
			{
				method: 'POST',
				credentials: 'same-origin',
				headers: this.headers( { 'Content-Type': 'application/json' } ),
				body: JSON.stringify( { attachmentId, slot, replacing } ),
			}
		);

		if ( ! response.ok ) {
			throw await toError( response );
		}
	}
}
