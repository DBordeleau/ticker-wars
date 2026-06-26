import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import CompeteCtaButton from "./CompeteCtaButton";

type Props = {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onClick: () => void;
};

const DOCK_MARGIN_X = 56;
const DOCK_MARGIN_Y = 50;

type Geom = { homeLeft: number; homeTop: number; dockLeft: number; dockTop: number };

export default function FloatingCompeteCTA({ anchorRef, scrollerRef, onClick }: Props) {
  const ctaRef = useRef<HTMLButtonElement>(null);
  const geomRef = useRef<Geom>({ homeLeft: 0, homeTop: 0, dockLeft: 0, dockTop: 0 });
  const [ready, setReady] = useState(false);

  const { scrollY } = useScroll({ container: scrollerRef as React.RefObject<HTMLElement> });
  const progress = useTransform(scrollY, (v) => {
    const vh = window.innerHeight || 1;
    return Math.min(1, Math.max(0, v / (vh * 0.6)));
  });
  const smooth = useSpring(progress, { stiffness: 120, damping: 26, mass: 0.6 });

  const left = useTransform(smooth, (p) => {
    const g = geomRef.current;
    return g.homeLeft + (g.dockLeft - g.homeLeft) * p;
  });
  const top = useTransform(smooth, (p) => {
    const g = geomRef.current;
    return g.homeTop + (g.dockTop - g.homeTop) * p;
  });
  const scale = useTransform(smooth, [0, 1], [1, 0.9]);

  useLayoutEffect(() => {
    const measure = () => {
      const anchor = anchorRef.current;
      const cta = ctaRef.current;
      if (!anchor || !cta) return;
      const a = anchor.getBoundingClientRect();
      const w = cta.offsetWidth;
      const h = cta.offsetHeight;
      // `a.top` is viewport-relative and therefore depends on the current scroll
      // position. Add the scroller's scrollTop so `homeTop` is the anchor's
      // position as if scrolled to the top — otherwise measuring while scrolled
      // (e.g. on a resize after moving between monitors) records an off-screen
      // home and the CTA flies away when you scroll back up.
      const scrollTop = scrollerRef.current?.scrollTop ?? 0;
      geomRef.current = {
        homeLeft: a.left + a.width / 2 - w / 2,
        homeTop: a.top + scrollTop + a.height / 2 - h / 2,
        dockLeft: window.innerWidth - DOCK_MARGIN_X - w,
        dockTop: window.innerHeight - DOCK_MARGIN_Y - h,
      };
      setReady(true);
    };

    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef]);

  return (
    <motion.div className="floating-compete-cta" style={{ x: left, y: top, scale, opacity: ready ? 1 : 0 }}>
      <CompeteCtaButton ref={ctaRef} onClick={onClick} />
    </motion.div>
  );
}
