import { Badge, HoverCard, Skeleton, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { FiArrowRight } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { TickerCloseSnapshot, TickerProfile } from "../../api/dashboardData";
import { loadTickerCloseSnapshot, loadTickerProfile } from "../../api/tickerCache";
import { formatCurrency, formatDate, formatSignedPercent } from "../../utils/format";
import { getModelInfo, modelTypeColor } from "../../utils/models";
import MagicHoverSurface from "../layout/MagicHoverSurface";

type BaseProps = { children: ReactNode };
type ModelProps = BaseProps & { kind: "model"; slug: string; name?: string };
type TickerProps = BaseProps & { kind: "ticker"; ticker: string; logoUrl?: string | null };
type Props = ModelProps | TickerProps;

// Smooth scale + lift, used for both entry and exit via Mantine's Transition.
const cardTransition = {
  in: { opacity: 1, transform: "translateY(0) scale(1)" },
  out: { opacity: 0, transform: "translateY(8px) scale(0.96)" },
  common: { transformOrigin: "bottom center" },
  transitionProperty: "opacity, transform",
};

export default function EntityHoverCard(props: Props) {
  // Quick-look cards are a pointer affordance; skip them on touch / small screens.
  const canHover = useMediaQuery("(min-width: 768px) and (hover: hover)") ?? false;

  if (!canHover) {
    return <>{props.children}</>;
  }

  return (
    <HoverCard
      width="auto"
      position="top"
      offset={10}
      openDelay={220}
      closeDelay={120}
      withinPortal
      shadow="none"
      transitionProps={{
        transition: cardTransition,
        duration: 190,
        exitDuration: 150,
        timingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      <HoverCard.Target>{props.children}</HoverCard.Target>
      <HoverCard.Dropdown className="entity-hover-dropdown">
        <MagicHoverSurface className="entity-hover-surface">
          {props.kind === "model" ? (
            <ModelCardBody slug={props.slug} name={props.name} />
          ) : (
            <TickerCardBody ticker={props.ticker} logoUrl={props.logoUrl} />
          )}
        </MagicHoverSurface>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function ModelCardBody({ slug, name }: { slug: string; name?: string }) {
  const info = getModelInfo(slug, name);

  return (
    <div className="entity-hover-card">
      <Badge color={modelTypeColor(info.type)} className="entity-hover-type">
        {info.type}
      </Badge>
      <Text className="entity-hover-title">{info.name}</Text>
      <Text className="entity-hover-desc" lineClamp={5}>
        {info.description}
      </Text>
      <Link className="entity-hover-cta" to={`/models/${info.slug}`}>
        View model page
        <FiArrowRight aria-hidden />
      </Link>
    </div>
  );
}

function TickerCardBody({ ticker, logoUrl }: { ticker: string; logoUrl?: string | null }) {
  const { profile, close, loading } = useTickerHoverData(ticker);
  const symbol = ticker.trim().toUpperCase();
  const name = profile?.company_name ?? symbol;
  const showSymbolBadge = name.toUpperCase() !== symbol;
  const industry = profile?.industry ?? profile?.sector ?? null;
  const logo = logoUrl ?? profile?.logo_data_url ?? null;
  const summary = profile?.business_summary ?? null;
  const moveClass =
    close?.change == null
      ? "entity-hover-move-flat"
      : close.change > 0
        ? "entity-hover-move-up"
        : close.change < 0
          ? "entity-hover-move-down"
          : "entity-hover-move-flat";

  return (
    <div className="entity-hover-card">
      <div className="entity-hover-ticker-head">
        <span className="entity-hover-logo">
          {logo ? (
            <img src={logo} alt="" className="ticker-logo-image" />
          ) : (
            <span className="entity-hover-logo-fallback">{symbol.slice(0, 1)}</span>
          )}
        </span>
        <div className="entity-hover-ticker-copy">
          <Text className="entity-hover-title">{name}</Text>
          <div className="entity-hover-badge-row">
            {showSymbolBadge ? (
              <Badge variant="outline" color="gray" className="entity-hover-symbol">
                {symbol}
              </Badge>
            ) : null}
            {industry ? (
              <Badge variant="light" color="green" className="entity-hover-industry">
                {industry}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {close ? (
        <div className="entity-hover-close">
          <span className="entity-hover-close-label">{formatDate(close.date)} close</span>
          <span className="entity-hover-close-value">
            {formatCurrency(close.close)}
            {close.change != null && close.change_percent != null ? (
              <span className={`entity-hover-move ${moveClass}`}>
                {formatSignedPercent(close.change_percent)}
              </span>
            ) : null}
          </span>
        </div>
      ) : loading ? (
        <Skeleton height={18} width="62%" radius="sm" />
      ) : null}

      {summary ? (
        <Text className="entity-hover-desc" lineClamp={3}>
          {summary}
        </Text>
      ) : loading ? (
        <Skeleton height={40} radius="sm" />
      ) : null}

      <Link className="entity-hover-cta" to={`/tickers/${symbol}`}>
        View ticker page
        <FiArrowRight aria-hidden />
      </Link>
    </div>
  );
}

// Profile + close snapshot fetched lazily when a card first opens. Both resolve
// from the shared per-ticker cache (see api/tickerCache), so the ticker detail
// page and these cards never refetch the same ticker.
function useTickerHoverData(ticker: string) {
  const key = ticker.trim().toUpperCase();
  const [profile, setProfile] = useState<TickerProfile | null>(null);
  const [close, setClose] = useState<TickerCloseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      loadTickerProfile(key).catch(() => null),
      loadTickerCloseSnapshot(key).catch(() => null),
    ])
      .then(([nextProfile, nextClose]) => {
        if (!active) return;
        setProfile(nextProfile);
        setClose(nextClose);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [key]);

  return { profile, close, loading };
}
