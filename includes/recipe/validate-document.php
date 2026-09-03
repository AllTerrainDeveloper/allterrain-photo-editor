<?php
/**
 * Validating the document: its canvas and its layer stack.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Validates a layer stack.
 *
 * A document always has at least one layer, so an unusable stack falls back to a single
 * image layer rather than to nothing -- the pixels are still there either way, and an
 * empty stack would render a blank canvas over them.
 *
 * Only the *description* of a layer is stored here. A raster layer's pixels live in a
 * GPU texture, and travel with a save as a file of their own (see
 * `lienzo_store_layer_files()`); a text layer's words are its description, and are
 * enough to draw it again. A text layer that has lost its words is kept as a raster
 * layer, so whatever pixels it has are still shown.
 *
 * @since 0.1.0
 *
 * @param array $raw Candidate recipe.
 * @return array Validated layer stack, never empty.
 */
function lienzo_validate_layers( $raw ) {
	$candidates = isset( $raw['layers'] ) && is_array( $raw['layers'] ) ? $raw['layers'] : array();
	$layers     = array();

	foreach ( $candidates as $candidate ) {
		if ( ! is_array( $candidate ) ) {
			continue;
		}

		$id   = isset( $candidate['id'] ) && is_string( $candidate['id'] ) && '' !== $candidate['id']
			? $candidate['id']
			: LIENZO_BASE_LAYER_ID;
		$kind = isset( $candidate['kind'] ) && is_string( $candidate['kind'] ) ? $candidate['kind'] : 'image';
		$text = null;

		if ( 'text' === $kind ) {
			$text = lienzo_validate_text_source( isset( $candidate['text'] ) ? $candidate['text'] : null );

			if ( null === $text ) {
				$kind = 'raster';
			}
		} elseif ( 'raster' !== $kind ) {
			$kind = 'image';
		}

		$layer = array(
			'id'        => $id,
			'name'      => isset( $candidate['name'] ) && is_string( $candidate['name'] )
				? sanitize_text_field( $candidate['name'] )
				: 'Image',
			'kind'      => $kind,
			'transform' => lienzo_validate_layer(
				isset( $candidate['transform'] ) ? $candidate['transform'] : null
			),
			'visible'   => ! isset( $candidate['visible'] ) || (bool) $candidate['visible'],
			'opacity'   => isset( $candidate['opacity'] ) && is_numeric( $candidate['opacity'] )
				? min( 1.0, max( 0.0, (float) $candidate['opacity'] ) )
				: 1.0,
		);

		if ( null !== $text ) {
			$layer['text'] = $text;
		}

		$layers[] = $layer;
	}

	if ( empty( $layers ) ) {
		// A pre-v5 recipe carries one transform under `layer`; anything else falls back
		// to an untransformed base image.
		$layers[] = array_merge(
			lienzo_default_layer_entry(),
			array(
				'transform' => lienzo_validate_layer(
					isset( $raw['layer'] ) ? $raw['layer'] : null
				),
			)
		);
	}

	return $layers;
}

/**
 * Validates what a text layer says, and how it is set.
 *
 * Deliberately the same rules as `normaliseTextSource()` in the browser. The text
 * itself is kept as typed: it is drawn onto a canvas and never rendered as markup, so
 * stripping tags would mangle a caption that happens to contain a less-than sign.
 * Control characters other than newlines and tabs go, and the length is bounded.
 *
 * @since 1.1.0
 *
 * @param mixed $raw Candidate source.
 * @return array|null Normalised source, or null when there is no text in it.
 */
function lienzo_validate_text_source( $raw ) {
	if ( ! is_array( $raw ) || ! isset( $raw['text'] ) || ! is_string( $raw['text'] ) ) {
		return null;
	}

	$text = wp_check_invalid_utf8( $raw['text'] );
	$text = preg_replace( '/[^\P{C}\n\t]/u', '', $text );

	if ( null === $text ) {
		return null;
	}

	if ( function_exists( 'mb_substr' ) ) {
		$text = mb_substr( $text, 0, 5000 );
	} else {
		$text = substr( $text, 0, 5000 );
	}

	if ( '' === trim( $text ) ) {
		return null;
	}

	$size   = isset( $raw['size'] ) && is_numeric( $raw['size'] ) ? (float) $raw['size'] : 72.0;
	$stroke = isset( $raw['strokeWidth'] ) && is_numeric( $raw['strokeWidth'] ) ? (float) $raw['strokeWidth'] : 0.0;
	$family = isset( $raw['family'] ) && is_string( $raw['family'] ) ? trim( sanitize_text_field( $raw['family'] ) ) : '';
	$colour = isset( $raw['colour'] ) && is_string( $raw['colour'] ) ? $raw['colour'] : '';

	if ( ! preg_match( '/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $colour ) ) {
		$colour = '#000000';
	}

	return array(
		'text'        => $text,
		'size'        => min( 2000.0, max( 1.0, $size ) ),
		'family'      => '' !== $family ? substr( $family, 0, 200 ) : 'sans-serif',
		'colour'      => $colour,
		'bold'        => ! empty( $raw['bold'] ),
		'italic'      => ! empty( $raw['italic'] ),
		'strokeWidth' => min( 200.0, max( 0.0, $stroke ) ),
	);
}

/**
 * Validates a canvas size.
 *
 * Zero means "not sized yet" and is legitimate: a freshly migrated recipe has no
 * canvas until the editor opens the image and fills it in.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Candidate canvas.
 * @return array Normalised canvas size.
 */
function lienzo_validate_canvas( $raw ) {
	$canvas = array(
		'width'  => 0,
		'height' => 0,
	);

	if ( ! is_array( $raw ) ) {
		return $canvas;
	}

	$width  = isset( $raw['width'] ) ? (int) $raw['width'] : 0;
	$height = isset( $raw['height'] ) ? (int) $raw['height'] : 0;

	if ( $width <= 0 || $height <= 0 ) {
		return $canvas;
	}

	return array(
		'width'  => max( 16, $width ),
		'height' => max( 16, $height ),
	);
}

/**
 * Validates a layer transform.
 *
 * Position is deliberately unclamped: a layer may hang off the edge of the canvas,
 * which is exactly what happens when one is scaled up to fill a frame.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Candidate transform.
 * @return array Normalised layer transform.
 */
function lienzo_validate_layer( $raw ) {
	$layer = lienzo_default_layer();

	if ( ! is_array( $raw ) ) {
		return $layer;
	}

	foreach ( array( 'x', 'y' ) as $axis ) {
		if ( isset( $raw[ $axis ] ) && is_numeric( $raw[ $axis ] ) ) {
			$layer[ $axis ] = (float) $raw[ $axis ];
		}
	}

	// A pre-v4 layer carried one `scale` for both axes.
	$uniform = isset( $raw['scale'] ) && is_numeric( $raw['scale'] )
		? (float) $raw['scale']
		: 1.0;

	foreach ( array( 'scaleX', 'scaleY' ) as $axis ) {
		$value          = isset( $raw[ $axis ] ) && is_numeric( $raw[ $axis ] )
			? (float) $raw[ $axis ]
			: $uniform;
		$layer[ $axis ] = min( 20.0, max( 0.02, $value ) );
	}

	if ( isset( $raw['rotation'] ) && is_numeric( $raw['rotation'] ) ) {
		$rotation = fmod( (float) $raw['rotation'], 360.0 );

		if ( $rotation > 180.0 ) {
			$rotation -= 360.0;
		}

		if ( $rotation <= -180.0 ) {
			$rotation += 360.0;
		}

		$layer['rotation'] = $rotation;
	}

	$layer['flipH'] = ! empty( $raw['flipH'] );
	$layer['flipV'] = ! empty( $raw['flipV'] );

	return $layer;
}
