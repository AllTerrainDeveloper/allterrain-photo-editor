/**
 * Getting the edit back out.
 *
 * Two destinations, one render. Saving writes a new attachment and never touches the
 * original; exporting writes a file to the user's device and never touches the media
 * library at all -- which is why exporting needs no capability beyond opening the
 * editor.
 */

import { __ } from '../i18n';
import type { LayerUpload, RestClient } from '../net/rest';
import { toast } from '../platform';
import type { MediaPayload, SaveResult } from '../types';
import { download, exportFilename, savedMessage } from './download';
import type { RecipeStore } from './recipe-store';

/** Renders the edit at full resolution. */
export type RenderFull = ( format: string, quality: number ) => Promise< Blob >;

/** What the output path needs from the renderer. */
export interface OutputRenderer {
	renderFull: RenderFull;
	sourceSize: { width: number };
	/** A layer's pixels as a PNG, or null when it has none. */
	exportLayer: ( layerId: string ) => Promise< Blob | null >;
}

export interface OutputOptions {
	store: RecipeStore;
	client: RestClient;
	/** The largest file the render endpoint accepts, in bytes. */
	maxUploadBytes: number;
	/** Null until the renderer has started. */
	getRenderer: () => OutputRenderer | null;
	getPayload: () => MediaPayload | null;
	/** True once the editor has been torn down, so a late result is dropped. */
	isDestroyed: () => boolean;
	/** Called around a render, so the toolbar can lock. */
	setBusy: ( busy: boolean ) => void;
}

/**
 * Renders and delivers the finished image.
 */
export class OutputController {
	private options: OutputOptions;

	/** True while a full-resolution render is in flight, to prevent a double save. */
	private busy = false;

	/**
	 * @param options Output configuration.
	 */
	constructor( options: OutputOptions ) {
		this.options = options;
	}

	/**
	 * Renders the edit at full resolution.
	 *
	 * @return The encoded image, or null when rendering failed.
	 */
	private async render(): Promise< Blob | null > {
		const renderer = this.options.getRenderer();

		if ( ! renderer ) {
			return null;
		}

		const { format, quality } = this.options.store.current.output;

		this.setBusy( true );

		try {
			return await renderer.renderFull( format, quality );
		} catch ( error ) {
			this.report( error, __( 'The image could not be rendered.' ) );

			return null;
		} finally {
			this.setBusy( false );
		}
	}

	/**
	 * Saves the edit as a new attachment.
	 *
	 * Never modifies the original. The success message reports the dimensions the
	 * site actually stored rather than the ones rendered, because WordPress applies
	 * `big_image_size_threshold` to every upload and will quietly downscale a large
	 * render -- claiming otherwise would be a comfortable lie.
	 *
	 * @return The saved attachment, or null when nothing was written.
	 */
	async save(): Promise< SaveResult | null > {
		const payload = this.options.getPayload();

		if ( this.busy || ! payload ) {
			return null;
		}

		const blob = await this.render();

		if ( ! blob || this.options.isDestroyed() ) {
			return null;
		}

		const rendered = this.options.getRenderer()?.sourceSize;

		try {
			this.setBusy( true );

			const layers = await this.exportLayers();

			if ( this.options.isDestroyed() ) {
				return null;
			}

			const result = await this.options.client.saveRender(
				payload.id,
				blob,
				this.options.store.current,
				layers
			);

			toast( savedMessage( result, rendered?.width ), 'success' );

			return result;
		} catch ( error ) {
			this.report( error, __( 'The image could not be saved.' ) );

			return null;
		} finally {
			this.setBusy( false );
		}
	}

	/**
	 * Encodes every painted layer, so the copy can be opened with them again.
	 *
	 * All or nothing. A save is only re-editable when every raster layer travels with
	 * it, so one layer too large for the site to accept means none go and the copy
	 * flattens -- which the server reports, and the banner explains -- rather than a
	 * copy that opens with half its layers.
	 *
	 * @return The layers to upload; empty when the save should flatten.
	 */
	private async exportLayers(): Promise< LayerUpload[] > {
		const renderer = this.options.getRenderer();

		if ( ! renderer ) {
			return [];
		}

		const layers: LayerUpload[] = [];

		for ( const layer of this.options.store.current.layers ) {
			if ( 'raster' !== layer.kind ) {
				continue;
			}

			const blob = await renderer.exportLayer( layer.id );

			if ( ! blob ) {
				continue;
			}

			if ( blob.size > this.options.maxUploadBytes ) {
				return [];
			}

			layers.push( { id: layer.id, blob } );
		}

		return layers;
	}

	/**
	 * Downloads the rendered image to the user's device.
	 */
	async exportToDevice(): Promise< void > {
		const blob = await this.render();

		if ( ! blob || this.options.isDestroyed() ) {
			return;
		}

		download(
			blob,
			exportFilename(
				this.options.getPayload()?.title ?? '',
				this.options.store.current.output.format
			)
		);
		toast( __( 'Downloaded.' ), 'success' );
	}

	/**
	 * Marks the controller busy and tells the toolbar.
	 *
	 * @param busy Whether a render is in flight.
	 */
	private setBusy( busy: boolean ): void {
		this.busy = busy;
		this.options.setBusy( busy );
	}

	/**
	 * Reports a failure, preferring the server's own wording.
	 *
	 * @param error    The failure.
	 * @param fallback What to say when it carried no message.
	 */
	private report( error: unknown, fallback: string ): void {
		toast( error instanceof Error ? error.message : fallback, 'error' );
	}
}
