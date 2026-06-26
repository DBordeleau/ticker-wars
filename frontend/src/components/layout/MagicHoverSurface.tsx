import type { CSSProperties, MouseEvent, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

type SurfaceStyle = CSSProperties & {
  "--magic-x"?: string;
  "--magic-y"?: string;
};

const childSpotlightSelector = [
  ".horizon-selector-wrap",
  ".prediction-filters .mantine-Input-wrapper",
  ".chart-panel .mantine-Input-wrapper",
  ".model-toggle",
  ".spotlight-control-wrap",
  ".landing-faq-item",
].join(",");

export default function MagicHoverSurface({ children, className = "" }: Props) {
  const handlePointerMove = (event: MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--magic-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--magic-y", `${event.clientY - bounds.top}px`);

    event.currentTarget.querySelectorAll<HTMLElement>(childSpotlightSelector).forEach((child) => {
      const childBounds = child.getBoundingClientRect();
      child.style.setProperty("--spotlight-child-x", `${event.clientX - childBounds.left}px`);
      child.style.setProperty("--spotlight-child-y", `${event.clientY - childBounds.top}px`);
    });
  };

  const style: SurfaceStyle = {
    "--magic-x": "50%",
    "--magic-y": "50%",
  };

  return (
    <div className={`magic-hover-surface ${className}`} style={style} onMouseMove={handlePointerMove}>
      {children}
    </div>
  );
}
