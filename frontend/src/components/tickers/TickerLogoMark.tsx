type Props = {
  ticker: string;
  logoUrl?: string | null;
  size?: "sm" | "md";
};

export default function TickerLogoMark({ ticker, logoUrl, size = "sm" }: Props) {
  const normalizedTicker = ticker.trim().toUpperCase();
  const label = `${normalizedTicker} logo`;

  return (
    <span className={`ticker-logo-mark ticker-logo-mark-${size}`} aria-hidden="true">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={label}
          className="ticker-logo-mark-image"
          loading="lazy"
        />
      ) : (
        <span className="ticker-logo-mark-fallback">{normalizedTicker.slice(0, 1)}</span>
      )}
    </span>
  );
}
