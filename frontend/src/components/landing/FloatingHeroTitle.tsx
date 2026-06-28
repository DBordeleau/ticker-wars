import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";

type Props = {
  anchorRef: React.RefObject<HTMLHeadingElement | null>;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
};

const DOCK_TOP = 64;
const DOCK_SCALE = 1;

// The "Ticker Wars" title. Always horizontally centered (the wrapper handles
// that), it scrolls up from its in-hero position and docks as a small persistent
// header above the leaderboard / sphere / FAQ sections as the first viewport
// scrolls out. Desktop/motion only; otherwise the title renders inline in the hero.
export default function FloatingHeroTitle({ anchorRef, scrollerRef }: Props) {
  const homeTopRef = useRef(0);
  const [ready, setReady] = useState(false);

  const { scrollY } = useScroll({ container: scrollerRef as React.RefObject<HTMLElement> });
  const progress = useTransform(scrollY, (v) => {
    const vh = window.innerHeight || 1;
    return Math.min(1, Math.max(0, v / (vh * 0.6)));
  });
  const smooth = useSpring(progress, { stiffness: 120, damping: 26, mass: 0.6 });

  const y = useTransform(smooth, (p) => {
    const homeTop = homeTopRef.current;
    return homeTop + (DOCK_TOP - homeTop) * p;
  });
  const scale = useTransform(smooth, [0, 1], [1, DOCK_SCALE]);

  useLayoutEffect(() => {
    const measure = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      // Add the scroller's scrollTop so homeTop is the title's position as if at
      // the top of the page, regardless of the current scroll position.
      const scrollTop = scrollerRef.current?.scrollTop ?? 0;
      homeTopRef.current = rect.top + scrollTop;
      setReady(true);
    };

    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, scrollerRef]);

  return (
    <div className="floating-hero-title-wrap" style={{ opacity: ready ? 1 : 0 }}>
      <motion.h1
        className="hero-title floating-hero-title"
        style={{ y, scale, transformOrigin: "top center" }}
      >
        <span className="hero-title-text">Ticker </span>
        <span className="accent">Wars</span>
      </motion.h1>
    </div>
  );
}
