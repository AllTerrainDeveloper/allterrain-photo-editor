<?php
/**
 * The render endpoint: turning an uploaded render into a new attachment.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * POST /lienzo/v1/media/<id>/render
 *
 * Accepts a rendered image and stores it as a new attachment.
 *
 * The response reports the dimensions actually stored rather than the ones sent.
 * WordPress applies `big_image_size_threshold` (2560px by default) to every upload,
 * so a 6000px render is silently downscaled and kept as a `-scaled` derivative.
 * Telling the user "saved at 6000px" when the site holds 2560px would be a lie the
 * editor is uniquely positioned to catch.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Response payload or error.
 */
function lienzo_rest_render( $request ) {
	$attachment_id = (int) $request['id'];
	$source_id     = lienzo_resolve_source_id( $attachment_id );

	if ( $source_id !== $attachment_id && ! lienzo_can_edit( $source_id ) ) {
		$source_id = $attachment_id;
	}

	$recipe = lienzo_validate_recipe( $request->get_param( 'recipe' ) );

	if ( is_wp_error( $recipe ) ) {
		return $recipe;
	}

	if ( $recipe['source'] !== $source_id ) {
		return new WP_Error(
			'lienzo_recipe_source_mismatch',
			__( 'The edit recipe does not belong to this image.', 'allterrain-photo-editor' ),
			array( 'status' => 400 )
		);
	}

	$files = $request->get_file_params();

	if ( empty( $files['file'] ) ) {
		return new WP_Error(
			'lienzo_render_missing_file',
			__( 'No rendered image was uploaded.', 'allterrain-photo-editor' ),
			array( 'status' => 400 )
		);
	}

	$new_id = lienzo_store_render(
		$files['file'],
		$source_id,
		$recipe,
		lienzo_layer_uploads( $files )
	);

	if ( is_wp_error( $new_id ) ) {
		return $new_id;
	}

	$metadata = wp_get_attachment_metadata( $new_id );

	$response = rest_ensure_response(
		array(
			'id'        => $new_id,
			'sourceId'  => $source_id,
			'url'       => wp_get_attachment_url( $new_id ),
			'width'     => isset( $metadata['width'] ) ? (int) $metadata['width'] : 0,
			'height'    => isset( $metadata['height'] ) ? (int) $metadata['height'] : 0,
			'mime'      => get_post_mime_type( $new_id ),
			'recipe'    => $recipe,

			/*
			 * Whether the painted content was baked in. A flattened save is its own
			 * origin, so re-opening it shows those pixels rather than replaying a
			 * recipe over the original -- and the editor says so, because "saved" and
			 * "saved, and the layers are now pixels" are different promises.
			 */
			'flattened' => ! lienzo_recipe_is_reproducible(
				$recipe,
				array_keys( lienzo_get_layer_files( $new_id ) )
			),
		)
	);

	$response->set_status( 201 );
	$response->header( 'Location', rest_url( LIENZO_REST_NAMESPACE . '/media/' . $new_id ) );

	return $response;
}
