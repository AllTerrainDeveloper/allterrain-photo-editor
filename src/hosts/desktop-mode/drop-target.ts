/**
 * Registering the window as a drop target with the desktop shell.
 */

import { __ } from '../../i18n';
import type { DroppedImage } from '../../editor';
import { desktop } from './desktop-api';
import { readDesktopImage } from './image-payload';
import { toast } from '../../platform';

/** Separate registrations, including when the shell evaluates this bundle twice. */
const targetPrefix = `lienzo-window-${ Math.random().toString( 36 ).slice( 2 ) }`;
let nextTarget = 0;

/**
 * Lets a photo be dragged from the desktop onto the editor to open it.
 *
 * @param element Drop area.
 * @param drop    Called with the dropped image.
 * @return Unregister function, or null when drag support is unavailable.
 */
export function registerDropTarget(
	element: HTMLElement,
	drop: ( dropped: DroppedImage ) => void
): ( () => void ) | null {
	const manager = desktop()?.dragManager;

	if ( ! manager?.registerDropTarget ) {
		return null;
	}

	let disposed = false;

	// Called on the manager, never pulled off it. The shell's method reads its own
	// `this`, so a detached reference throws `Cannot read properties of undefined` --
	// and it throws inside a render callback, which takes the whole window down with it.
	const release = manager.registerDropTarget( {
		id: `${ targetPrefix }-${ ++nextTarget }`,
		element,
		accept: ( payload ) => {
			const image = readDesktopImage( payload );
			return !! image && ( image.kind === 'attachment' ||
				!! desktop()?.files?.rest?.addUploadToMediaLibrary );
		},
		acceptLabel: __( 'Add as a layer' ),
		onDrop: async ( session, at ) => {
			const image = readDesktopImage( session.payload );
			if ( ! image || disposed ) {
				return;
			}

			try {
				let attachmentId = image.id;
				let title = image.title;
				if ( image.kind === 'upload' ) {
					const rest = desktop()?.files?.rest;
					if ( ! rest?.addUploadToMediaLibrary ) {
						return;
					}
					const attachment = await rest.addUploadToMediaLibrary( image.id );
					attachmentId = attachment.attachmentId;
					title = attachment.title || title;
				}
				if ( ! disposed ) {
					drop( { attachmentId, title, clientX: at?.clientX, clientY: at?.clientY } );
				}
			} catch ( error ) {
				if ( ! disposed ) {
					toast( error instanceof Error ? error.message : __( 'That image could not be added.' ), 'error' );
				}
			}
		},
	} );

	return () => {
		disposed = true;
		release();
	};
}
