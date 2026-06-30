import { Badge, HoverCard, Skeleton, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { FiArrowRight } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { TickerCloseSnapshot, TickerProfile } from "../../api/dashboardData";
import { loadLivePriceSnapshot } from "../../api/livePriceCache";
import { resolveTickerDisplayPrice, type LivePriceSnapshot } from "../../api/livePrices";
import { fetchPublicUserProfile, type PublicUserProfileBundle } from "../../api/publicProfiles";
import { loadTickerCloseSnapshot, loadTickerProfile } from "../../api/tickerCache";
import { titleForLevel } from "../../api/gamification";
import { formatCurrency, formatPercent, formatSignedPercent } from "../../utils/format";
import { getModelInfo, modelTypeColor } from "../../utils/models";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import UserIdentityBlock from "../users/UserIdentityBlock";

type BaseProps = { children: ReactNode };
type ModelProps = BaseProps & { kind: "model"; slug: string; name?: string };
type TickerProps = BaseProps & { kind: "ticker"; ticker: string; logoUrl?: string | null };
type UserProps = BaseProps & { kind: "user"; username: string };
type Props = ModelProps | TickerProps | UserProps;

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
          ) : props.kind === "ticker" ? (
            <TickerCardBody ticker={props.ticker} logoUrl={props.logoUrl} />
          ) : (
            <UserCardBody username={props.username} />
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

function UserCardBody({ username }: { username: string }) {
  const { bundle, loading } = usePublicUserHoverData(username);
  const profile = bundle?.profile ?? null;
  const featuredBadges = bundle ? getFeaturedBadges(bundle.badges) : [];

  if (loading) {
    return (
      <div className="entity-hover-card">
        <Skeleton height={46} radius="sm" />
        <Skeleton height={60} radius="sm" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="entity-hover-card">
        <Text className="entity-hover-title">{username}</Text>
        <Text className="entity-hover-desc">This profile is private or unavailable.</Text>
      </div>
    );
  }

  return (
    <div className="entity-hover-card entity-hover-user-card">
      <UserIdentityBlock
        displayUsername={profile.display_username}
        username={profile.username}
        avatarSeed={profile.avatar_seed}
        avatarOptions={profile.avatar_options}
        level={profile.level}
        displayTitle={titleForLevel(profile.level)}
        featuredBadges={featuredBadges}
        badgePresentation="full"
        size={44}
      />
      <div className="entity-hover-user-stats">
        <span>
          <strong>{profile.scored_count.toLocaleString()}</strong>
          scored
        </span>
        <span>
          <strong>{formatPercent(profile.directional_accuracy)}</strong>
          directional
        </span>
        <span>
          <strong>{profile.badge_count.toLocaleString()}</strong>
          badges
        </span>
      </div>
      <Link className="entity-hover-cta" to={`/users/${profile.username}`}>
        View profile
        <FiArrowRight aria-hidden />
      </Link>
    </div>
  );
}

function getFeaturedBadges(badges: PublicUserProfileBundle["badges"]) {
  const slottedBadges = badges
    .filter((badge) => badge.featured_slot === 1 || badge.featured_slot === 2)
    .sort((a, b) => (a.featured_slot ?? 99) - (b.featured_slot ?? 99));

  if (slottedBadges.length > 0) {
    return slottedBadges;
  }

  const legacyFeatured = badges.filter((badge) => badge.is_featured);
  return legacyFeatured.length > 0 ? legacyFeatured.slice(0, 2) : badges.slice(0, 2);
}

function TickerCardBody({ ticker, logoUrl }: { ticker: string; logoUrl?: string | null }) {
  const { profile, close, live, loading } = useTickerHoverData(ticker);
  const symbol = ticker.trim().toUpperCase();
  const name = profile?.company_name ?? symbol;
  const showSymbolBadge = name.toUpperCase() !== symbol;
  const industry = profile?.industry ?? profile?.sector ?? null;
  const logo = logoUrl ?? profile?.logo_data_url ?? null;
  const summary = profile?.business_summary ?? null;
  const displayPrice = resolveTickerDisplayPrice(live, close);
  const moveClass =
    displayPrice?.change == null
      ? "entity-hover-move-flat"
      : displayPrice.change > 0
        ? "entity-hover-move-up"
        : displayPrice.change < 0
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

      {displayPrice ? (
        <div className="entity-hover-close">
          <span className="entity-hover-close-label">
            {displayPrice.label}
            <span className={`entity-hover-freshness entity-hover-${displayPrice.freshness}`}>
              {displayPrice.detailLabel}
            </span>
          </span>
          <span className="entity-hover-close-value">
            {formatCurrency(displayPrice.price)}
            {displayPrice.change != null && displayPrice.changePercent != null ? (
              <span className={`entity-hover-move ${moveClass}`}>
                {formatSignedPercent(displayPrice.changePercent)}
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

function usePublicUserHoverData(username: string) {
  const key = username.trim().toLowerCase();
  const [bundle, setBundle] = useState<PublicUserProfileBundle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchPublicUserProfile(key)
      .then((nextBundle) => {
        if (active) setBundle(nextBundle);
      })
      .catch(() => {
        if (active) setBundle(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [key]);

  return { bundle, loading };
}

// Profile + close snapshot fetched lazily when a card first opens. Both resolve
// from the shared per-ticker cache (see api/tickerCache), so the ticker detail
// page and these cards never refetch the same ticker.
function useTickerHoverData(ticker: string) {
  const key = ticker.trim().toUpperCase();
  const [profile, setProfile] = useState<TickerProfile | null>(null);
  const [close, setClose] = useState<TickerCloseSnapshot | null>(null);
  const [live, setLive] = useState<LivePriceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      loadTickerProfile(key).catch(() => null),
      loadTickerCloseSnapshot(key).catch(() => null),
      loadLivePriceSnapshot(key).catch(() => null),
    ])
      .then(([nextProfile, nextClose, nextLive]) => {
        if (!active) return;
        setProfile(nextProfile);
        setClose(nextClose);
        setLive(nextLive);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [key]);

  return { profile, close, live, loading };
}
