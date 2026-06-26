import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useMemo, useRef } from "react";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import EntityHoverCard from "../cards/EntityHoverCard";
import { LANDING_TICKERS } from "./landingTickers";

type Props = {
  tickerLogos: Record<string, string | null>;
};

type Point = { x: number; y: number; z: number };

function fibonacciSphere(n: number): Point[] {
  const points: Point[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i += 1) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return points;
}

function LogoTile({ ticker, logoUrl }: { ticker: string; logoUrl?: string | null }) {
  return logoUrl ? (
    <img src={logoUrl} alt="" className="ticker-sphere-img" loading="lazy" />
  ) : (
    <span className="ticker-sphere-fallback">{ticker.slice(0, 1)}</span>
  );
}

export default function TickerLogoSphere({ tickerLogos }: Props) {
  const tickers = LANDING_TICKERS;
  const points = useMemo(() => fibonacciSphere(tickers.length), [tickers.length]);

  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)") ?? false;
  const isCompact = useMediaQuery("(max-width: 820px)") ?? false;
  const use3d = !reduceMotion && !isCompact;

  const stageRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rotRef = useRef({ rx: -10, ry: 0 });
  // Angular velocity in deg/frame. Cursor swipes inject impulses; friction
  // decays back to a slow idle spin.
  const velRef = useRef({ vx: 0, vy: 0.16 });
  const lastPointerRef = useRef({ x: 0, y: 0, t: 0, active: false });
  const hoverRef = useRef(false);
  const radiusRef = useRef(180);

  useEffect(() => {
    if (!use3d) return undefined;

    const measure = () => {
      const el = stageRef.current?.parentElement;
      if (!el) return;
      const size = Math.min(el.clientWidth, el.clientHeight || el.clientWidth);
      radiusRef.current = Math.max(120, size * 0.4);
    };
    measure();
    window.addEventListener("resize", measure);

    const radPerDeg = Math.PI / 180;
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      if (document.hidden) return;

      const rot = rotRef.current;
      const vel = velRef.current;
      // Horizontal: friction toward a slow idle spin (idle stops while hovering a
      // logo so its hover card stays readable).
      const idle = hoverRef.current ? 0 : 0.12;
      vel.vy = vel.vy * 0.95 + idle * 0.05;
      vel.vy = Math.max(-3, Math.min(3, vel.vy));
      rot.ry += vel.vy;
      // Vertical: free rotation with friction (no idle, no clamp) so the globe
      // can be flicked up and down and coasts to a stop.
      vel.vx *= 0.95;
      vel.vx = Math.max(-3, Math.min(3, vel.vx));
      rot.rx += vel.vx;

      if (stageRef.current) {
        stageRef.current.style.transform = `rotateX(${rot.rx}deg) rotateY(${rot.ry}deg)`;
      }

      const ry = rot.ry * radPerDeg;
      const rx = rot.rx * radPerDeg;
      const cosRy = Math.cos(ry);
      const sinRy = Math.sin(ry);
      const cosRx = Math.cos(rx);
      const sinRx = Math.sin(rx);
      const radius = radiusRef.current;

      for (let i = 0; i < points.length; i += 1) {
        const node = nodeRefs.current[i];
        if (!node) continue;
        const p = points[i];
        // world = Rx * Ry * p (matches CSS "rotateX(rx) rotateY(ry)")
        const x1 = p.x * cosRy + p.z * sinRy;
        const z1 = -p.x * sinRy + p.z * cosRy;
        const z2 = p.y * sinRx + z1 * cosRx;
        const depth = (z2 + 1) / 2; // 0 (back) .. 1 (front)
        const scale = 0.68 + depth * 0.5;
        node.style.opacity = String(0.28 + depth * 0.72);
        node.style.zIndex = String(Math.round(depth * 100));
        node.style.pointerEvents = depth > 0.45 ? "auto" : "none";
        node.style.transform =
          `translate3d(${p.x * radius}px, ${p.y * radius}px, ${p.z * radius}px)` +
          ` rotateY(${-rot.ry}deg) rotateX(${-rot.rx}deg) scale(${scale})`;
      }
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [points, use3d]);

  const handlePointerMove = (event: MouseEvent<HTMLDivElement>) => {
    const now = performance.now();
    const last = lastPointerRef.current;
    const px = event.clientX;
    const py = event.clientY;
    // Only impart spin from free movement over the cloud — not while hovering a
    // logo (so reading a hover card never flings the globe).
    if (last.active && !hoverRef.current) {
      const dt = Math.max(8, now - last.t); // ms, floored to avoid spikes
      const dx = px - last.x;
      const dy = py - last.y;
      const gain = 0.42;
      const vel = velRef.current;
      // Swipe right -> spin left, swipe left -> spin right; swipe up/down spins
      // the globe vertically. Clamped so a fast flick can't fling it out of control.
      vel.vy = Math.max(-3, Math.min(3, vel.vy + (-dx / dt) * gain));
      vel.vx = Math.max(-3, Math.min(3, vel.vx + (-dy / dt) * gain));
    }
    lastPointerRef.current = { x: px, y: py, t: now, active: true };
  };
  const handlePointerLeave = () => {
    lastPointerRef.current.active = false;
  };

  if (!use3d) {
    return (
      <div className="ticker-sphere-grid">
        {tickers.map((ticker) => (
          <EntityHoverCard key={ticker} kind="ticker" ticker={ticker} logoUrl={tickerLogos[ticker]}>
            <Link to={`/tickers/${ticker}`} className="ticker-sphere-logo" aria-label={`${ticker} ticker`}>
              <LogoTile ticker={ticker} logoUrl={tickerLogos[ticker]} />
            </Link>
          </EntityHoverCard>
        ))}
      </div>
    );
  }

  return (
    <div
      className="ticker-sphere"
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
    >
      <div className="ticker-sphere-stage" ref={stageRef}>
        {tickers.map((ticker, index) => (
          <div
            key={ticker}
            className="ticker-sphere-node"
            ref={(el) => {
              nodeRefs.current[index] = el;
            }}
          >
            <EntityHoverCard kind="ticker" ticker={ticker} logoUrl={tickerLogos[ticker]}>
              <Link
                to={`/tickers/${ticker}`}
                className="ticker-sphere-logo"
                aria-label={`${ticker} ticker`}
                onMouseEnter={() => {
                  hoverRef.current = true;
                }}
                onMouseLeave={() => {
                  hoverRef.current = false;
                }}
              >
                <LogoTile ticker={ticker} logoUrl={tickerLogos[ticker]} />
              </Link>
            </EntityHoverCard>
          </div>
        ))}
      </div>
    </div>
  );
}
