<?php
/**
 * Uninstall routine.
 *
 * AllTerrain Photo Editor stores three things outside its own files: the edit recipe, the source
 * pointer and the painted layers a save kept beside itself. The first two are post meta
 * on attachments the plugin created; the third is a directory of PNGs under uploads,
 * one folder per saved copy. The attachments themselves are ordinary media items and are
 * deliberately left alone -- deleting a user's photos because they removed an editor
 * would be indefensible. Only the metadata and the layer files go.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_post_meta_by_key( '_lienzo_recipe' );
delete_post_meta_by_key( '_lienzo_source' );
delete_post_meta_by_key( '_lienzo_layers' );

$lienzo_uploads = wp_upload_dir( null, false );
$lienzo_dir     = trailingslashit( $lienzo_uploads['basedir'] ) . 'allterrain-photo-editor';

if ( is_dir( $lienzo_dir ) ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';

	global $wp_filesystem;

	if ( WP_Filesystem() && $wp_filesystem ) {
		$wp_filesystem->rmdir( $lienzo_dir, true );
	}
}
