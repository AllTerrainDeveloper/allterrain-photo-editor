/**
 * The banner that offers the copy just saved.
 */

import { __ } from '../i18n';
import { createButton } from '../ui/controls';
import type { SaveResult } from '../types';

/**
 * Offers a link to the copy that was just created.
 *
 * A toast disappears; someone who saved and then wanted to open the result would
 * otherwise have to go hunting through the media library for it.
 *
 * @param host   Where the banner goes. Any previous one is replaced.
 * @param result Save response.
 * @param onOpen Opens the saved copy.
 * @return Teardown.
 */
export function announceSave(
	host: HTMLElement,
	result: SaveResult,
	onOpen: () => void
): () => void {
	host.querySelector( '.lz-saved' )?.remove();

	const banner = document.createElement( 'p' );
	banner.className = 'lz-saved';

	// A button rather than a link: the saved copy opens in this same window, and
	// following a URL would navigate the whole desktop shell away.
	const open = createButton( {
		label: __( 'Open the saved copy' ),
		variant: 'secondary',
		onClick: onOpen,
	} );

	// Two different promises, so two different sentences. A flattened save cannot be
	// re-opened as an editable recipe, and finding that out by re-opening it is
	// exactly the surprise this avoids.
	banner.append(
		document.createTextNode(
			result.flattened
				? __(
						'Saved a copy. Its painted layers were too large to keep, so they were baked in; re-opening shows those pixels rather than the layers. '
				  )
				: __( 'Saved a copy. Open it again and every layer is still there to edit. ' )
		),
		open.el
	);

	host.prepend( banner );

	return () => {
		open.destroy();
		banner.remove();
	};
}
