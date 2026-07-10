import type { ChartRow } from "./types";

export function renderActualDot(props: unknown) {
  const dot = props as { cx?: number; cy?: number; payload?: ChartRow };
  if (dot.cx == null || dot.cy == null || !dot.payload) {
    return <g />;
  }
  if (dot.payload.kind === "history") {
    return (
      <circle
        cx={dot.cx}
        cy={dot.cy}
        r={2.5}
        fill="#f4f7f5"
        stroke="#06110b"
        strokeWidth={1.4}
        opacity={0.58}
      />
    );
  }
  if (dot.payload.kind === "close") {
    return <circle cx={dot.cx} cy={dot.cy} r={2.8} fill="#f4f7f5" opacity={0.72} />;
  }
  if (dot.payload.kind === "current") {
    return (
      <circle
        cx={dot.cx}
        cy={dot.cy}
        r={5}
        fill="#f4f7f5"
        stroke="#22c55e"
        strokeWidth={2.4}
      />
    );
  }
  return <g />;
}

export function renderActualActiveDot(props: unknown) {
  const dot = props as { cx?: number; cy?: number; payload?: ChartRow };
  if (dot.cx == null || dot.cy == null || !dot.payload) {
    return <g />;
  }
  if (dot.payload.kind === "edge" || dot.payload.kind === "forecast") {
    return <g />;
  }
  return (
    <circle
      cx={dot.cx}
      cy={dot.cy}
      r={5.5}
      fill="#f4f7f5"
      stroke={dot.payload.kind === "current" ? "#22c55e" : "#06110b"}
      strokeWidth={2.4}
    />
  );
}

export function renderForecastDot(model: string, color: string) {
  return (props: unknown) => {
    const dot = props as { cx?: number; cy?: number; payload?: ChartRow };
    if (dot.cx == null || dot.cy == null || dot.payload?.kind !== "forecast") {
      return <g />;
    }
    if (dot.payload[model] == null) {
      return <g />;
    }
    return <circle cx={dot.cx} cy={dot.cy} r={4.8} fill={color} stroke="#06110b" strokeWidth={2} />;
  };
}
