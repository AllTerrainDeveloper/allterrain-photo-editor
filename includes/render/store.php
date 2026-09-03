<?php
/**
 * Writing a render into the media library as a new attachment.
 *
 * Never touches the original. The saved copy is a new attachment carrying the recipe
 * that produced it, so it can be re-opened and the sliders restored -- and the
 * original is still there, untouched, if the edit was a mistake.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Stores a rendered image as a new attachment.
 *
 * @since 0.1.0
 * @since 1.1.0 Accepts the painted layers' pixels, so the copy can open with them again.
 *
 * @param array $file      Uploaded file array from `WP_REST_Request::get_file_params()`.
 * @param int   $source_id Attachment the pixels were rendered from.
 * @param array $recipe    Validated recipe.
 * @param array $layers    Optional. Uploaded layer files keyed by layer id, as
 *                         `lienzo_layer_uploads()` returns them. Default none.
 * @return int|WP_Error New attachment ID, or an error.
 */
function lienzo_store_render( $file, $source_id, $recipe, $layers = array() ) {
	// Sideloading runs from a REST request, where the admin includes are not loaded.
	// Only the two files whose functions are called below: `wp_handle_sideload()` from
	// file.php, and `wp_generate_attachment_metadata()` from image.php.
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';

	$source_path = lienzo_get_source_path( $source_id );

	if ( is_wp_error( $source_path ) ) {
		return $source_path;
	}

	$max = lienzo_max_upload_bytes();

	if ( isset( $file['size'] ) && (int) $file['size'] > $max ) {
		return new WP_Error(
			'lienzo_render_too_large',
			sprintf(
				/* translators: %s: maximum upload size, already formatted. */
				__( 'The rendered image is larger than the %s limit for this site.', 'allterrain-photo-editor' ),
				size_format( $max )
			),
			array( 'status' => 413 )
		);
	}

	// Name the file ourselves from the source and the requested format. The client
	// does not get to choose the extension, because the extension is what WordPress
	// keys its MIME check on.
	$file['name'] = lienzo_edited_filename( $source_path, $recipe['output']['format'] );

	$sideloaded = wp_handle_sideload(
		$file,
		array(
			'test_form' => false,
			'mimes'     => lienzo_upload_mimes(),
		)
	);

	if ( isset( $sideloaded['error'] ) ) {
		return new WP_Error(
			'lienzo_sideload_failed',
			$sideloaded['error'],
			array( 'status' => 400 )
		);
	}

	// wp_handle_sideload() sniffs the real content type rather than trusting the
	// name we just gave it. Re-check the answer: a file that arrives claiming to be
	// a PNG but is something else must not become an attachment.
	if ( ! lienzo_is_supported_mime( $sideloaded['type'] ) ) {
		wp_delete_file( $sideloaded['file'] );

		return new WP_Error(
			'lienzo_render_bad_type',
			__( 'The rendered image was not a supported image type.', 'allterrain-photo-editor' ),
			array( 'status' => 400 )
		);
	}

	$source_post = get_post( $source_id );

	$attachment_id = wp_insert_attachment(
		array(
			'post_mime_type' => $sideloaded['type'],
			'post_title'     => $source_post ? $source_post->post_title : '',
			'post_content'   => '',
			'post_status'    => 'inherit',
		),
		$sideloaded['file'],
		0,
		true
	);

	if ( is_wp_error( $attachment_id ) ) {
		wp_delete_file( $sideloaded['file'] );

		return $attachment_id;
	}

	$metadata = wp_generate_attachment_metadata( $attachment_id, $sideloaded['file'] );

	// Record where this came from, using core's own provenance convention alongside
	// our own pointer, so tools that already understand `parent_image` keep working.
	$metadata['parent_image'] = array(
		'attachment_id' => $source_id,
		'file'          => _wp_relative_upload_path( $source_path ),
	);

	/**
	 * Filters the metadata of a freshly rendered image.
	 *
	 * Mirrors core's filter of the same name from its REST image editor, so a
	 * plugin already listening for edited images sees AllTerrain Photo Editor's output too.
	 *
	 * @since 0.1.0
	 *
	 * @param array $metadata      Attachment metadata.
	 * @param int   $attachment_id New attachment ID.
	 * @param int   $source_id     Attachment the pixels came from.
	 */
	// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Deliberately reuses core's hook name so listeners already handling edited images see ours too.
	$metadata = apply_filters( 'wp_edited_image_metadata', $metadata, $attachment_id, $source_id );

	wp_update_attachment_metadata( $attachment_id, $metadata );

	/*
	 * A save is only re-editable from the original when the recipe describes all of
	 * it. Adjustments, crops, transforms and text are instructions and replay exactly;
	 * a painted, pasted or dropped layer is pixels. Those used to live nowhere but in
	 * the flattened file just written, and pointing such a save back at the original
	 * told the editor to rebuild from pixels that never had the paint on them: the file
	 * in the library was right, and opening it showed the original with an empty layer
	 * where the painting had been.
	 *
	 * Now the layers travel with the save, each as a PNG of its own, and the copy points
	 * back at the original with a recipe that can be replayed in full. Only when a
	 * layer could not come along -- too large for the site, or simply not sent -- does
	 * the save become its own origin, so re-opening it shows exactly what was saved.
	 */
	$stored = lienzo_store_layer_files( $attachment_id, $layers, $recipe );

	if ( lienzo_recipe_is_reproducible( $recipe, array_keys( $stored ) ) ) {
		update_post_meta( $attachment_id, LIENZO_SOURCE_META, $source_id );
		update_post_meta( $attachment_id, LIENZO_RECIPE_META, wp_json_encode( $recipe ) );

		if ( ! empty( $stored ) ) {
			update_post_meta( $attachment_id, LIENZO_LAYERS_META, $stored );
		}
	} else {
		// Half the layers are no use: the copy opens flattened, so nothing should
		// suggest otherwise.
		lienzo_delete_layer_files( $attachment_id );
	}

	$alt = get_post_meta( $source_id, '_wp_attachment_image_alt', true );

	if ( '' !== $alt ) {
		update_post_meta( $attachment_id, '_wp_attachment_image_alt', wp_slash( $alt ) );
	}

	/**
	 * Fires after a rendered image has been stored.
	 *
	 * @since 0.1.0
	 *
	 * @param int   $attachment_id New attachment ID.
	 * @param int   $source_id     Attachment the pixels came from.
	 * @param array $recipe        Validated recipe.
	 */
	do_action( 'lienzo_image_saved', $attachment_id, $source_id, $recipe );

	return $attachment_id;
}
