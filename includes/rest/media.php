<?php
/**
 * Reading an image, and proxying its source bytes.
 *
 * The proxy exists for one reason: a CDN-served original taints the canvas, and a
 * tainted canvas cannot be read back -- so every later save would fail. Serving the
 * bytes same-origin is what keeps a CDN from breaking the editor entirely.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * GET /lienzo/v1/media/<id>
 *
 * Returns everything the editor needs to open an image: where to fetch the pixels,
 * how big they are, and any recipe from a previous edit.
 *
 * When the requested attachment was itself produced by AllTerrain Photo Editor, the response
 * points at the *original* it was derived from. That is what makes a re-edit
 * first-generation rather than a re-render of already-baked pixels.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Response payload or error.
 */
function lienzo_rest_get_media( $request ) {
	$attachment_id = (int) $request['id'];
	$source_id     = lienzo_resolve_source_id( $attachment_id );

	// The pointer could name an attachment the current user cannot read.
	if ( $source_id !== $attachment_id && ! lienzo_can_edit( $source_id ) ) {
		$source_id = $attachment_id;
	}

	$path = lienzo_get_source_path( $source_id );

	if ( is_wp_error( $path ) ) {
		return $path;
	}

	$source_post = get_post( $source_id );
	$dimensions  = wp_getimagesize( $path );

	if ( ! $dimensions ) {
		return new WP_Error(
			'lienzo_unreadable_image',
			__( 'The image dimensions could not be read. The file may be corrupt.', 'allterrain-photo-editor' ),
			array( 'status' => 422 )
		);
	}

	$url = wp_get_original_image_url( $source_id );

	if ( ! $url ) {
		$url = wp_get_attachment_url( $source_id );
	}

	$recipe = lienzo_get_recipe( $attachment_id );

	if ( null === $recipe ) {
		$recipe = lienzo_default_recipe( $source_id );
	}

	$payload = array(
		'id'        => $attachment_id,
		'sourceId'  => $source_id,
		'mime'      => $source_post->post_mime_type,
		'url'       => $url,
		'sourceUrl' => rest_url( LIENZO_REST_NAMESPACE . '/media/' . $source_id . '/source' ),
		'width'     => (int) $dimensions[0],
		'height'    => (int) $dimensions[1],
		'title'     => $source_post->post_title,
		'alt'       => (string) get_post_meta( $source_id, '_wp_attachment_image_alt', true ),
		'recipe'    => $recipe,
		'canSave'   => current_user_can( 'upload_files' ),
		'schema'    => lienzo_op_schema(),
	);

	// Where each painted layer's pixels can be fetched back, for a copy saved with
	// them. Absent rather than empty when there are none, so a client reading an
	// older payload and a newer one see the same shape.
	$layer_urls = lienzo_layer_urls( $attachment_id );

	if ( ! empty( $layer_urls ) ) {
		$payload['layers'] = $layer_urls;
	}

	/**
	 * Filters the payload describing an image opened in the editor.
	 *
	 * @since 0.1.0
	 *
	 * @param array $payload       Response payload.
	 * @param int   $attachment_id Attachment the client asked for.
	 * @param int   $source_id     Attachment the pixels will be loaded from.
	 */
	$payload = apply_filters( 'lienzo_rest_media_payload', $payload, $attachment_id, $source_id );

	return rest_ensure_response( $payload );
}

/**
 * GET /lienzo/v1/media/<id>/layers/<layer>
 *
 * Streams one saved layer's pixels.
 *
 * Through a route rather than a plain upload URL for the same reason the source is:
 * a site that offloads uploads to a CDN would otherwise hand the browser a cross-origin
 * PNG, and a cross-origin texture taints every later read of the canvas.
 *
 * @since 1.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Streaming response, or error.
 */
function lienzo_rest_get_layer( $request ) {
	$path = lienzo_layer_path( (int) $request['id'], (string) $request['layer'] );

	if ( '' === $path ) {
		return new WP_Error(
			'lienzo_no_layer',
			__( 'That layer was not saved with this image.', 'allterrain-photo-editor' ),
			array( 'status' => 404 )
		);
	}

	return lienzo_rest_stream_file( $path, 'image/png' );
}

/**
 * GET /lienzo/v1/media/<id>/source
 *
 * Streams the original image bytes from the same origin as wp-admin.
 *
 * This exists for one reason: WebGL taints a canvas when it samples a cross-origin
 * texture, and a tainted canvas makes both `extract.pixels()` (the histogram) and
 * `convertToBlob()` (the save) throw. Sites using a CDN or an offload plugin serve
 * uploads from another origin, so the client falls back to this route and loads the
 * bytes through a blob URL instead.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Streaming response, or error.
 */
function lienzo_rest_get_source( $request ) {
	$attachment_id = (int) $request['id'];
	$path          = lienzo_get_source_path( $attachment_id );

	if ( is_wp_error( $path ) ) {
		return $path;
	}

	$post = get_post( $attachment_id );

	return lienzo_rest_stream_file( $path, $post->post_mime_type );
}

/**
 * Answers a REST request with a file's bytes rather than JSON.
 *
 * @since 1.1.0
 *
 * @param string $path Absolute path of a readable file.
 * @param string $mime Its content type.
 * @return WP_REST_Response Streaming response.
 */
function lienzo_rest_stream_file( $path, $mime ) {
	$size = (int) filesize( $path );

	add_filter(
		'rest_pre_serve_request',
		static function ( $served ) use ( $path, $mime, $size ) {
			if ( $served ) {
				return $served;
			}

			nocache_headers();
			header( 'Content-Type: ' . $mime );
			header( 'Content-Length: ' . $size );
			header( 'X-Robots-Tag: noindex' );
			header( 'X-Content-Type-Options: nosniff' );

			readfile( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- Streaming a large binary; WP_Filesystem would buffer the whole file in memory.

			return true;
		},
		10,
		1
	);

	return new WP_REST_Response( null, 200 );
}
