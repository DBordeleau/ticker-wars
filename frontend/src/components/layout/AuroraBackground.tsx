import { useCallback, useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  drift: number;
  size: number;
  opacity: number;
  baseOpacity: number;
  glow: number;
};

const desktopParticleCount = 225;
const mobileParticleCount = 80;
const mobileParticleBreakpoint = 760;
const influenceRadius = 150;
const baseGreen = "74, 222, 128";
const activeGreen = "80, 255, 100";

function getParticleCount(width: number) {
  return width <= mobileParticleBreakpoint ? mobileParticleCount : desktopParticleCount;
}

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const sizeRef = useRef({ width: 0, height: 0 });

  const createParticle = useCallback((width: number, height: number): Particle => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.12 + Math.random() * 0.22;
    const opacity = 0.28 + Math.random() * 0.26;

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      phase: Math.random() * Math.PI * 2,
      drift: 0.004 + Math.random() * 0.006,
      size: 1 + Math.random() * 3.4,
      opacity,
      baseOpacity: opacity,
      glow: 1,
    };
  }, []);

  const initParticles = useCallback((width: number, height: number) => {
    particlesRef.current = Array.from({ length: getParticleCount(width) }, () => createParticle(width, height));
  }, [createParticle]);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (particlesRef.current.length === 0) {
      initParticles(width, height);
    } else {
      const previous = sizeRef.current;
      const scaleX = previous.width > 0 ? width / previous.width : 1;
      const scaleY = previous.height > 0 ? height / previous.height : 1;
      const nextParticleCount = getParticleCount(width);

      particlesRef.current.forEach((particle) => {
        particle.x = Math.max(0, Math.min(width, particle.x * scaleX));
        particle.y = Math.max(0, Math.min(height, particle.y * scaleY));
      });

      if (particlesRef.current.length > nextParticleCount) {
        particlesRef.current = particlesRef.current.slice(0, nextParticleCount);
      }

      while (particlesRef.current.length < nextParticleCount) {
        particlesRef.current.push(createParticle(width, height));
      }
    }

    sizeRef.current = { width, height };
  }, [createParticle, initParticles]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = canvas.width / Math.max(1, window.innerWidth);
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const particle of particlesRef.current) {
      const dx = mouseRef.current.x - particle.x;
      const dy = mouseRef.current.y - particle.y;
      const distance = Math.hypot(dx, dy);
      const force = Math.max(0, (influenceRadius - distance) / influenceRadius);

      if (force > 0 && distance > 0) {
        particle.vx += (dx / distance) * force * 0.018;
        particle.vy += (dy / distance) * force * 0.018;
      }

      particle.phase += particle.drift;
      particle.vx += Math.cos(particle.phase) * 0.0022;
      particle.vy += Math.sin(particle.phase * 0.82) * 0.0022;
      particle.glow += (1 + force * 2.8 - particle.glow) * 0.12;
      particle.opacity += (particle.baseOpacity + force * 0.45 - particle.opacity) * 0.12;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.997;
      particle.vy *= 0.997;

      if (particle.x < -12) particle.x = width + 12;
      if (particle.x > width + 12) particle.x = -12;
      if (particle.y < -12) particle.y = height + 12;
      if (particle.y > height + 12) particle.y = -12;

      const color = force > 0.03 ? activeGreen : baseGreen;
      ctx.save();
      ctx.globalAlpha = particle.opacity;
      ctx.shadowColor = `rgba(${color}, ${0.78 + force * 0.22})`;
      ctx.shadowBlur = 12 * particle.glow;
      ctx.fillStyle = `rgba(${color}, ${0.86 + force * 0.14})`;
      ctx.beginPath();
      ctx.arc(
        particle.x * dpr,
        particle.y * dpr,
        particle.size * particle.glow * dpr,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    frameRef.current = window.requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    sizeCanvas();

    const handlePointerMove = (event: PointerEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };
    const handlePointerLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    window.addEventListener("resize", sizeCanvas);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    frameRef.current = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", sizeCanvas);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [draw, sizeCanvas]);

  return (
    <div className="aurora-bg" aria-hidden>
      <div className="aurora-blob aurora-blob-emerald" />
      <div className="aurora-blob aurora-blob-teal" />
      <div className="aurora-blob aurora-blob-cyan" />
      <canvas ref={canvasRef} className="gravity-stars-canvas" />
      <div className="aurora-grain" />
      <div className="aurora-vignette" />
    </div>
  );
}
