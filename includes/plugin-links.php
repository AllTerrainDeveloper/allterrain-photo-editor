<?php
/**
 * The links under the plugin's name on the Plugins screen.
 *
 * Somebody stuck on an edit looks for help where they installed the plugin, so the
 * row points at the WordPress.org support forum: the place where a question gets an
 * answer the next person with the same question can find. Bug reports with a
 * reproduction still belong on GitHub, which the plugin URI already links to.
 *
 * Loaded with the requirements check rather than behind it. Someone whose editor will
 * not open because OpenStation is missing is the person most likely to need help.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * The WordPress.org support forum.
 */
define( 'LIENZO_SUPPORT_URL', 'https://wordpress.org/support/plugin/allterrain-photo-editor/' );

add_filter( 'plugin_row_meta', 'lienzo_plugin_row_meta', 10, 2 );

/**
 * Adds a Support link to this plugin's row.
 *
 * @since 1.1.4
 *
 * @param string[] $links The row's meta links.
 * @param string   $file  Plugin file path relative to the plugins directory.
 * @return string[]
 */
function lienzo_plugin_row_meta( $links, $file ) {
	if ( plugin_basename( LIENZO_FILE ) !== $file ) {
		return $links;
	}

	/**
	 * Filters where the Support link on the Plugins screen points.
	 *
	 * @since 1.1.4
	 *
	 * @param string $url The WordPress.org support forum. Empty removes the link.
	 */
	$url = (string) apply_filters( 'lienzo_support_url', LIENZO_SUPPORT_URL );

	if ( '' !== $url ) {
		$links[] = sprintf(
			'<a href="%s">%s</a>',
			esc_url( $url ),
			esc_html__( 'Support', 'allterrain-photo-editor' )
		);
	}

	return $links;
}
