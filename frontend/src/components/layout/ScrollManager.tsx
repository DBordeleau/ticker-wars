import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Per-history-entry scroll memory. Keyed by location.key, which React Router
// assigns a unique value to every history entry (including REPLACE).
const scrollPositions = new Map<string, number>();

function restoreScroll(target: number) {
  if (target <= 0) {
    window.scrollTo(0, 0);
    return;
  }
  // Content loads asynchronously, so the document may be too short to reach
  // `target` immediately. Retry across frames until it is tall enough or we
  // hit a sane cap (~1s at 60fps), so we never spin forever.
  let frames = 0;
  const maxFrames = 60;
  const settle = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(target, Math.max(maxScroll, 0)));
    frames += 1;
    if (maxScroll < target && frames < maxFrames) {
      requestAnimationFrame(settle);
    }
  };
  requestAnimationFrame(settle);
}

export default function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType(); // "PUSH" | "REPLACE" | "POP"
  // The history entry the live scroll listener should attribute scrolling to.
  const activeKeyRef = useRef(location.key);

  // Own the scroll restoration so the browser does not fight us.
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      /* not supported; ignore */
    }
    return () => {
      try {
        window.history.scrollRestoration = previous ?? "auto";
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Continuously record the live scroll offset for the *current* entry. Because
  // this runs while the user scrolls (well before any navigation), the offset
  // of the page being left is already saved by the time we navigate away. It is
  // attributed to activeKeyRef, which the layout effect below retargets the
  // instant a new entry is applied, so post-navigation scroll events (browser
  // scroll clamping on a shorter page, or our own scroll-to-top) are attributed
  // to the new entry and cannot corrupt the previous entry's saved offset.
  useEffect(() => {
    const onScroll = () => {
      scrollPositions.set(activeKeyRef.current, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Apply scroll on each navigation, before paint, so there is no visible jump.
  useLayoutEffect(() => {
    // Retarget the live listener to this entry before changing scroll, so any
    // scroll events triggered below are attributed here, not to the prior entry.
    activeKeyRef.current = location.key;

    // Respect in-page anchor links if any are ever added.
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }

    if (navigationType === "POP") {
      // Back/forward (incl. "Back to dashboard"): restore the saved offset.
      restoreScroll(scrollPositions.get(location.key) ?? 0);
    } else {
      // PUSH / REPLACE => a newly opened page. Start at the top.
      window.scrollTo(0, 0);
    }
  }, [location.key, location.hash, navigationType]);

  return null;
}
