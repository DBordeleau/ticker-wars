export function dateTimestamp(value: string) {
  return Date.parse(`${value}T16:00:00Z`);
}

export function chartTimestamp(value: string) {
  return isIsoDateOnly(value) ? dateTimestamp(value) : Date.parse(value);
}

export function formatAxisDate(value: string | number) {
  const date = parseChartDate(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatYAxisPrice(value: string | number) {
  const price = Number(value);
  if (!Number.isFinite(price)) {
    return String(value);
  }
  return `$${Math.round(price).toLocaleString("en-US")}`;
}

export function formatTooltipDate(value: string | number) {
  const text = String(value);
  const date = parseChartDate(value);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  const hasTime = typeof value === "number" || text.includes("T");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function parseChartDate(value: string | number) {
  if (typeof value === "number") {
    return new Date(value);
  }

  if (isIsoDateOnly(value)) {
    return new Date(`${value}T16:00:00Z`);
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return new Date(numericValue);
  }

  return new Date(value);
}

function isIsoDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
