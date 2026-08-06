'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a modal mounted long enough to animate itself out.
 *
 * A modal rendered as `{open && <div className="g-modal">}` can only ever
 * animate in. The moment the state flips the node is gone, so there is
 * nothing left for a closing animation to play on — which is why every
 * dialog in this app used to appear smoothly and then vanish on the frame
 * the button was pressed.
 *
 * This holds the node for MODAL_EXIT_MS with `is-closing` on it, then
 * drops it. Keep that in step with the exit keyframes in globals.css.
 *
 * It also latches the value it was given. Close handlers usually clear the
 * thing the modal is about in the same breath — `setNotice(null)`,
 * `setSelectedDoorId(null)` — and without a latch the card would empty out
 * halfway through its own exit. Pass the state the body reads and render
 * from `value`:
 *
 *   const modal = useModalTransition(notice);
 *   {modal.render && (
 *     <div className={modal.className} onClick={() => setNotice(null)}>
 *       <div className="g-pane g-modal__card">{modal.value?.message}</div>
 *     </div>
 *   )}
 *
 * A boolean works the same way when the body reads other state; to keep
 * that state alive through the exit, pass it as an object:
 * `useModalTransition(open ? { id, status } : null)`.
 */

export const MODAL_EXIT_MS = 200;

function exitDuration(): number {
  if (typeof window === 'undefined') return MODAL_EXIT_MS;
  // Reduced motion collapses the animation, so holding the node would just
  // be a delay before the modal blinked out.
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : MODAL_EXIT_MS;
}

export interface ModalTransition<T> {
  /** Render the modal now — true while open and while closing. */
  render: boolean;
  /** True only during the exit. */
  closing: boolean;
  /** The last non-empty value, so the body survives the exit. */
  value: T;
  /** Put this on the backdrop element instead of a literal "g-modal". */
  className: string;
}

export function useModalTransition<T>(value: T): ModalTransition<T> {
  const open = Boolean(value);
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);

  const latched = useRef(value);
  if (open) latched.current = value;

  // Tracks whether there is anything to animate out, so a component that
  // mounts closed does not schedule a pointless timer.
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setRender(true);
      setClosing(false);
      return;
    }

    if (!wasOpen.current) return;
    wasOpen.current = false;

    const ms = exitDuration();
    if (ms === 0) {
      setRender(false);
      return;
    }

    setClosing(true);
    const timer = setTimeout(() => {
      setRender(false);
      setClosing(false);
    }, ms);
    return () => clearTimeout(timer);
  }, [open]);

  return {
    render,
    closing,
    value: latched.current,
    className: closing ? 'g-modal is-closing' : 'g-modal',
  };
}
