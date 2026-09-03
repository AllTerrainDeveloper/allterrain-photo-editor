<?php
/**
 * Reading a stored recipe back off an attachment.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads and validates the stored recipe for an attachment.
 *
 * A stored recipe that no longer validates (because an op was removed by a plugin
 * deactivation, say) is treated as absent rather than fatal, so the editor still
 * opens with the image intact and the sliders at zero.
 *
 * @since 0.1.0
 *
 * @param int $attachment_id Attachment post ID.
 * @return array|null Validated recipe, or null when there is none.
 */
function lienzo_get_recipe( $attachment_id ) {
	$stored = lienzo_get_meta(
		(int) $attachment_id,
		LIENZO_RECIPE_META,
		LIENZO_LEGACY_RECIPE_META
	);

	if ( empty( $stored ) ) {
		return null;
	}

	$recipe = lienzo_validate_recipe( $stored );

	return is_wp_error( $recipe ) ? null : $recipe;
}

/**
 * Whether a recipe describes everything about the image it produced.
 *
 * An adjustment, a crop and a transform are instructions: given the original pixels,
 * they can be replayed exactly. So is a text layer, which carries the words it was
 * typed as. A painted, pasted or dropped layer is not: those are pixels, and they exist
 * only in the texture the browser rendered them into -- unless the save brought them
 * along as files of their own, in which case they can be put back exactly.
 *
 * The distinction decides what re-opening a saved image should do, which is why it
 * lives here beside the recipe rather than being inferred at the call site.
 *
 * @since 0.1.0
 * @since 1.1.0 Text layers are reproducible; raster layers are when their pixels were stored.
 *
 * @param array    $recipe Validated recipe.
 * @param string[] $stored Optional. Ids of the raster layers whose pixels were stored
 *                         with the save. Default none.
 * @return bool True when replaying the recipe over the original reproduces the save.
 */
function lienzo_recipe_is_reproducible( $recipe, $stored = array() ) {
	if ( ! isset( $recipe['layers'] ) || ! is_array( $recipe['layers'] ) ) {
		return true;
	}

	$stored = array_map( 'strval', (array) $stored );

	foreach ( $recipe['layers'] as $layer ) {
		$kind = isset( $layer['kind'] ) ? $layer['kind'] : 'image';

		if ( 'image' === $kind || 'text' === $kind ) {
			continue;
		}

		if ( ! isset( $layer['id'] ) || ! in_array( (string) $layer['id'], $stored, true ) ) {
			return false;
		}
	}

	return true;
}
