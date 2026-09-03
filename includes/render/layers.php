<?php
/**
 * Keeping a saved copy's painted layers.
 *
 * A raster layer -- a brush stroke, a paste, a dropped photo -- is pixels that exist
 * nowhere but in the browser. A save used to flatten them into the copy and stop
 * there, which made the copy correct and un-editable: opening it again showed the
 * paint baked in and the layer stack gone. So the editor now sends each raster layer
 * as a PNG of its own beside the render, and this file is where those land, where they
 * are read back from, and how they go when the copy does.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Where layer files live, under the uploads directory.
 *
 * @since 1.1.0
 */
const LIENZO_LAYERS_SUBDIR = 'allterrain-photo-editor/layers';

/**
 * Whether a layer id is safe to use as a filename and a URL segment.
 *
 * Mirrors `isSafeLayerId()` in the browser. The editor only ever mints ids of this
 * shape; anything else came from somewhere else and is not stored.
 *
 * @since 1.1.0
 *
 * @param mixed $layer_id Candidate id.
 * @return bool True when it may name a file.
 */
function lienzo_is_safe_layer_id( $layer_id ) {
	return is_string( $layer_id ) && 1 === preg_match( '/^[A-Za-z0-9_-]{1,64}$/', $layer_id );
}

/**
 * Picks the layer uploads out of a request's files.
 *
 * The editor sends them as `layers[<id>]`, which PHP presents as one entry whose every
 * field is an array keyed by id. This turns that inside out: one ordinary upload array
 * per layer, keyed by id, with anything malformed or failed left out.
 *
 * @since 1.1.0
 *
 * @param array $files `WP_REST_Request::get_file_params()`.
 * @return array<string, array> Upload arrays keyed by layer id.
 */
function lienzo_layer_uploads( $files ) {
	if ( ! isset( $files['layers'] ) || ! is_array( $files['layers'] ) || ! isset( $files['layers']['tmp_name'] ) ) {
		return array();
	}

	$group   = $files['layers'];
	$uploads = array();

	if ( ! is_array( $group['tmp_name'] ) ) {
		return array();
	}

	foreach ( $group['tmp_name'] as $layer_id => $tmp_name ) {
		if ( ! lienzo_is_safe_layer_id( (string) $layer_id ) || ! is_string( $tmp_name ) || '' === $tmp_name ) {
			continue;
		}

		$error = isset( $group['error'][ $layer_id ] ) ? (int) $group['error'][ $layer_id ] : UPLOAD_ERR_OK;

		if ( UPLOAD_ERR_OK !== $error ) {
			continue;
		}

		$uploads[ (string) $layer_id ] = array(
			'tmp_name' => $tmp_name,
			'name'     => $layer_id . '.png',
			'type'     => isset( $group['type'][ $layer_id ] ) ? (string) $group['type'][ $layer_id ] : 'image/png',
			'size'     => isset( $group['size'][ $layer_id ] ) ? (int) $group['size'][ $layer_id ] : 0,
			'error'    => $error,
		);
	}

	return $uploads;
}

/**
 * The directory a copy's layers are kept in.
 *
 * One directory per attachment, so deleting the copy deletes its layers in one move
 * and two copies can never share a file.
 *
 * @since 1.1.0
 *
 * @param int $attachment_id The saved copy.
 * @return array{path: string, url: string, relative: string} Absolute path, URL, and
 *                                                            the path relative to the
 *                                                            uploads directory.
 */
function lienzo_layers_dir( $attachment_id ) {
	$uploads  = wp_upload_dir( null, false );
	$relative = LIENZO_LAYERS_SUBDIR . '/' . (int) $attachment_id;

	return array(
		'path'     => trailingslashit( $uploads['basedir'] ) . $relative,
		'url'      => trailingslashit( $uploads['baseurl'] ) . $relative,
		'relative' => $relative,
	);
}

/**
 * Stores the uploaded layers a save brought along.
 *
 * Only layers the recipe actually has, and only raster ones: a text layer draws itself
 * from its words and an image layer from the original, so a file for either would be
 * dead weight. Each goes through `wp_handle_sideload()`, which is what checks that a
 * file claiming to be a PNG is one.
 *
 * @since 1.1.0
 *
 * @param int   $attachment_id The saved copy.
 * @param array $uploads       Upload arrays keyed by layer id, from `lienzo_layer_uploads()`.
 * @param array $recipe        Validated recipe.
 * @return array<string, string> Stored layers: id to path relative to the uploads directory.
 */
function lienzo_store_layer_files( $attachment_id, $uploads, $recipe ) {
	if ( empty( $uploads ) || ! isset( $recipe['layers'] ) || ! is_array( $recipe['layers'] ) ) {
		return array();
	}

	require_once ABSPATH . 'wp-admin/includes/file.php';

	$dir    = lienzo_layers_dir( $attachment_id );
	$max    = lienzo_max_upload_bytes();
	$stored = array();

	/**
	 * Sends the sideload into the copy's own directory.
	 *
	 * @param array $dirs Upload directory data.
	 * @return array Redirected data.
	 */
	$redirect = static function ( $dirs ) use ( $dir ) {
		$dirs['path']   = $dir['path'];
		$dirs['url']    = $dir['url'];
		$dirs['subdir'] = '/' . $dir['relative'];

		return $dirs;
	};

	foreach ( $recipe['layers'] as $layer ) {
		if ( ! isset( $layer['id'], $layer['kind'] ) || 'raster' !== $layer['kind'] ) {
			continue;
		}

		$layer_id = (string) $layer['id'];

		if ( ! isset( $uploads[ $layer_id ] ) || ! lienzo_is_safe_layer_id( $layer_id ) ) {
			continue;
		}

		$file = $uploads[ $layer_id ];

		if ( isset( $file['size'] ) && (int) $file['size'] > $max ) {
			continue;
		}

		$file['name'] = $layer_id . '.png';

		add_filter( 'upload_dir', $redirect );

		$sideloaded = wp_handle_sideload(
			$file,
			array(
				'test_form'                => false,
				'mimes'                    => array( 'png' => 'image/png' ),
				'unique_filename_callback' => static function () use ( $layer_id ) {
					return $layer_id . '.png';
				},
			)
		);

		remove_filter( 'upload_dir', $redirect );

		if ( isset( $sideloaded['error'] ) || 'image/png' !== $sideloaded['type'] ) {
			if ( isset( $sideloaded['file'] ) ) {
				wp_delete_file( $sideloaded['file'] );
			}

			continue;
		}

		$stored[ $layer_id ] = $dir['relative'] . '/' . $layer_id . '.png';
	}

	return $stored;
}

/**
 * The layers stored with a copy.
 *
 * @since 1.1.0
 *
 * @param int $attachment_id The saved copy.
 * @return array<string, string> Layer id to path relative to the uploads directory.
 */
function lienzo_get_layer_files( $attachment_id ) {
	$stored = get_post_meta( (int) $attachment_id, LIENZO_LAYERS_META, true );

	if ( ! is_array( $stored ) ) {
		return array();
	}

	$files = array();

	foreach ( $stored as $layer_id => $relative ) {
		if ( lienzo_is_safe_layer_id( (string) $layer_id ) && is_string( $relative ) && '' !== $relative ) {
			$files[ (string) $layer_id ] = $relative;
		}
	}

	return $files;
}

/**
 * The absolute path of one stored layer, if it exists on disk.
 *
 * @since 1.1.0
 *
 * @param int    $attachment_id The saved copy.
 * @param string $layer_id      Layer id.
 * @return string Readable path, or an empty string.
 */
function lienzo_layer_path( $attachment_id, $layer_id ) {
	$files = lienzo_get_layer_files( $attachment_id );

	if ( ! isset( $files[ $layer_id ] ) ) {
		return '';
	}

	$uploads = wp_upload_dir( null, false );
	$path    = trailingslashit( $uploads['basedir'] ) . ltrim( $files[ $layer_id ], '/' );

	// The stored path came from this plugin, but a path is a path: it has to resolve
	// inside the layers directory or it is not served.
	$real = realpath( $path );
	$root = realpath( trailingslashit( $uploads['basedir'] ) . LIENZO_LAYERS_SUBDIR );

	if ( false === $real || false === $root || 0 !== strpos( $real, $root . DIRECTORY_SEPARATOR ) ) {
		return '';
	}

	return is_readable( $real ) ? $real : '';
}

/**
 * Where each of a copy's layers can be fetched back from.
 *
 * Through this plugin's own routes rather than the files' URLs, for the reason the
 * source is: a CDN-served PNG is cross-origin, and a cross-origin texture taints the
 * canvas.
 *
 * @since 1.1.0
 *
 * @param int $attachment_id The saved copy.
 * @return array<string, string> Layer id to REST URL.
 */
function lienzo_layer_urls( $attachment_id ) {
	$urls = array();

	foreach ( array_keys( lienzo_get_layer_files( $attachment_id ) ) as $layer_id ) {
		$urls[ $layer_id ] = rest_url(
			LIENZO_REST_NAMESPACE . '/media/' . (int) $attachment_id . '/layers/' . $layer_id
		);
	}

	return $urls;
}

add_action( 'delete_attachment', 'lienzo_delete_layer_files' );

/**
 * Removes a copy's layer files along with the copy.
 *
 * Hooked to `delete_attachment`, and also called when a save turns out not to be
 * reproducible after all -- half a set of layers is no use to anyone.
 *
 * @since 1.1.0
 *
 * @param int $attachment_id The attachment being deleted.
 * @return void
 */
function lienzo_delete_layer_files( $attachment_id ) {
	$attachment_id = (int) $attachment_id;
	$dir           = lienzo_layers_dir( $attachment_id );

	delete_post_meta( $attachment_id, LIENZO_LAYERS_META );

	if ( ! is_dir( $dir['path'] ) ) {
		return;
	}

	$entries = scandir( $dir['path'] );

	if ( is_array( $entries ) ) {
		foreach ( $entries as $entry ) {
			if ( '.' !== $entry && '..' !== $entry ) {
				wp_delete_file( $dir['path'] . '/' . $entry );
			}
		}
	}

	// An empty directory of our own making, in our own corner of uploads. Core removes
	// its own empty upload directories the same way; a directory something else has
	// since written into is left where it is.
	$remaining = scandir( $dir['path'] );

	if ( is_array( $remaining ) && count( $remaining ) <= 2 ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
		rmdir( $dir['path'] );
	}
}
