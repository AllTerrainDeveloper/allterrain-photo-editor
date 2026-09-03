<?php
/**
 * Storing a render.
 *
 * This file is the loader: naming (`filenames`), the upload MIME allow-list (`mime`),
 * the painted layers a save keeps beside itself (`layers`), and the attachment write
 * itself (`store`).
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

require_once LIENZO_DIR . 'includes/render/filenames.php';
require_once LIENZO_DIR . 'includes/render/mime.php';
require_once LIENZO_DIR . 'includes/render/layers.php';
require_once LIENZO_DIR . 'includes/render/store.php';
