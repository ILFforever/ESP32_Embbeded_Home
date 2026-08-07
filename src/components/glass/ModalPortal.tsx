'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a modal at the document root instead of where it sits in the tree.
 *
 * `.g-modal` is `position: fixed`, which normally means "relative to the
 * viewport" — but only if no ancestor has established a containing block.
 * `backdrop-filter` does establish one, and every `.g-pane` carries a
 * backdrop-filter plus `overflow: hidden` for its rounded corners. So a modal
 * rendered inside a card was positioned against that card and then clipped to
 * it: the confirm dialogs came out cropped, sitting inside the card's rounded
 * rect rather than centred on the screen. The dashboard makes this worse by
 * opening a whole card inside `.g-modal__card` — itself a pane — so the card's
 * own dialogs were clipped to a box that was already a dialog.
 *
 * Portalling escapes both the containing block and the clip. It does not
 * change event handling: React portals still bubble through the React tree,
 * so the handlers a card puts on its modal keep working exactly as written.
 *
 * The mount gate is for SSR — `document` does not exist on the server, and
 * rendering the modal on the client only would be a hydration mismatch.
 * Modals open from user intent, well after mount, so nothing is lost.
 *
 * StationPresetPicker portals its menu by hand for the same reason. Use this
 * for anything else that has to sit above the page.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
