import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Back should mean "the page I came from", not "the front door".
 *
 * The back arrows on the top-level pages all navigated to `/` outright, so
 * anyone who reached Maps or My Library from inside a campaign was thrown out
 * to the main menu. This goes back through the browser's own history when
 * there is anything behind us, and only falls back to a fixed destination for
 * a page opened cold - a bookmark, a refresh, a link in a new tab.
 */
export function useAppBack(fallback = "/") {
  const [, setLocation] = useLocation();
  return useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation(fallback);
  }, [setLocation, fallback]);
}

/**
 * Makes a full-screen overlay behave like a page as far as Back is concerned.
 *
 * An overlay is not a route, so the browser (and the mouse's back button) knew
 * nothing about it: pressing Back inside the notes workspace left the campaign
 * entirely. While `open`, this holds one history entry of its own, so Back
 * closes the overlay and leaves you where you were.
 *
 * `onClose` must be stable enough not to change on every render; it is read
 * through a ref so the entry is pushed once per opening rather than on each
 * re-render.
 */
export function useOverlayHistory(open: boolean, onClose: () => void, key: string) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = { __overlay: key };
    window.history.pushState(marker, "");
    let closedByPop = false;
    const onPop = () => {
      closedByPop = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed from inside the overlay rather than by Back: drop the entry we
      // added, so Back doesn't have to be pressed twice to leave the page.
      if (!closedByPop && window.history.state?.__overlay === key) {
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
}
