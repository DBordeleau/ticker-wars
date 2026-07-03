import { Badge, Text } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { MetricHorizon } from "../../api/dashboardData";
import type { ScoreVerdict } from "../../api/gamification";
import { avatarOptionsFromSeed, buildDiceBearAvatarUrl } from "../../auth/avatar";
import type { AvatarOptions } from "../../auth/types";
import { formatSignedPercent } from "../../utils/format";
import { modelTypeColor, type ModelType } from "../../utils/models";
import EntityHoverCard, { type FakeUserHoverProfile } from "../cards/EntityHoverCard";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import TickerLogoMark from "../tickers/TickerLogoMark";
import ModelAvatar from "./ModelAvatar";
import { LANDING_TICKERS } from "./landingTickers";

const MotionPresence = AnimatePresence as unknown as ComponentType<{
  children: ReactNode;
  initial?: boolean;
  mode?: "sync" | "popLayout" | "wait";
}>;

type Props = {
  tickerLogos: Record<string, string | null>;
  onUserProfileClick?: (username: string) => void;
};

type FeedItem = {
  id: number;
  kind: "model" | "user";
  name: string;
  modelSlug?: string;
  modelType?: ModelType;
  avatarUrl?: string;
  fakeUser?: FakeUser;
  ticker: string;
  horizon: MetricHorizon;
  predictedReturn: number;
};

const MODEL_POOL: { name: string; slug: string; type: ModelType }[] = [
  { name: "Linear Regression", slug: "linear-regression", type: "Machine Learning" },
  { name: "Random Forest", slug: "random-forest", type: "Machine Learning" },
  { name: "TimesFM", slug: "timesfm", type: "Foundation Model" },
  { name: "Chronos-2", slug: "chronos-2", type: "Foundation Model" },
  { name: "Warren Buffbot", slug: "warren-buffbot", type: "Toy (LLM)" },
];

const USERNAMES = [
  "Zezima", "ALLinGME", "ThetaChud", "Bondicob", "spearrbk777", "moonbase", "forexmaster", "TheBearWhisperer",
  "sphere301", "DiamondDigits", "MOASS4TENDIES", "outofoptions", "tendiebot", "midcurve", "RagingBull",
  "LiterallyBankrupt", "bagcheckme", "onlydips", "candlewick", "longvol", "basistrader", "JimCramersHairline",
  "AIBubbleTruther", "riskparity", "TheBladeGamer", "Breakout11", "xToDx_XCELL", "stoplossly", "MelonHusk",
  "GrandmasterFunk", "CailChips", "Nesthorlan", "HedgehogFund", "BearishBard", "DCASPY4EVER", "CamTheMan3245",
  "KilljoyTheCat", "gabrielwingue", "OccupyTheDip", "RoaringPuppy", "zurplox", "TaxBezos", "insolvent", "RoeJogan",
  "UnrealOdin", "CFalcon", "CryptoBaron", "Goonbah", "COSTCOCHICKENS", "ShadesOfPale", "PennyStockPirate", "MikeBurrysPessimism",
  "shortGME", "ShallowFreakingValue", "TheMeltdownClown", "MisterMorale", "BearNecessity", "londontrader", "BigOunce",
  "BlackEspio", "crashcoot", "quadrillionaire", "BedBathAndBankrupt", "thequantqt", "Darktruth", "jaromirj"
];

type FakeUser = {
  name: string;
  avatarUrl: string;
  hoverProfile: FakeUserHoverProfile;
};
const USER_POOL: FakeUser[] = USERNAMES.map((name, index) => {
  const seed = `tw-${name}-${index}`;
  const avatarOptions = avatarOptionsFromSeed(seed) as AvatarOptions;
  return {
    name,
    avatarUrl: buildDiceBearAvatarUrl(seed, avatarOptions),
    hoverProfile: {
      avatarSeed: seed,
      avatarOptions,
      level: (index % 18) + 1,
      activePredictionCount: 1 + (index % 7),
      settledPredictionCount: 6 + ((index * 3) % 42),
      verdictCounts: fakeVerdictCounts(index),
    },
  };
});

// Fisher-Yates shuffle so the no-repeat order differs between visits.
for (let i = USER_POOL.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1));
  [USER_POOL[i], USER_POOL[j]] = [USER_POOL[j], USER_POOL[i]];
}
let userCursor = 0;
function nextUser(): FakeUser {
  const user = USER_POOL[userCursor % USER_POOL.length];
  userCursor += 1;
  return user;
}

const HORIZONS: MetricHorizon[] = ["1w", "1m", "3m", "1y"];
const HORIZON_EXPIRY: Record<string, string> = {
  "1w": "1 week",
  "1m": "1 month",
  "3m": "3 months",
  "1y": "1 year",
};
const VISIBLE = 6;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let nextId = 1;
function makeItem(previousKind?: FeedItem["kind"]): FeedItem {
  // Never surface two model predictions back to back: if the previous row was a
  // model, the next one is always a user.
  const isUser = previousKind === "model" ? true : Math.random() < 0.5;
  const base: FeedItem = {
    id: nextId++,
    kind: isUser ? "user" : "model",
    name: "",
    ticker: pick(LANDING_TICKERS),
    horizon: pick(HORIZONS),
    predictedReturn: Math.round((Math.random() * 0.16 - 0.07) * 1000) / 1000,
  };
  if (isUser) {
    const user = nextUser();
    return { ...base, name: user.name, avatarUrl: user.avatarUrl, fakeUser: user };
  }
  const model = pick(MODEL_POOL);
  return { ...base, name: model.name, modelSlug: model.slug, modelType: model.type };
}

// Seed the feed honoring the no-consecutive-models rule across the initial rows.
function makeInitialItems(count: number): FeedItem[] {
  const items: FeedItem[] = [];
  let previousKind: FeedItem["kind"] | undefined;
  for (let i = 0; i < count; i += 1) {
    const item = makeItem(previousKind);
    items.push(item);
    previousKind = item.kind;
  }
  return items;
}

export default function LivePredictionFeed({ tickerLogos, onUserProfileClick }: Props) {
  const [items, setItems] = useState<FeedItem[]>(() => makeInitialItems(VISIBLE));
  const pausedRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      setItems((current) => [makeItem(current[0]?.kind), ...current].slice(0, VISIBLE));
    }, 2200);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <MagicHoverSurface className="section-magic-surface live-feed-surface">
      <section
        className="section-panel live-feed-panel"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
      >
        <div className="live-feed-head">
          <Text className="section-title">Latest predictions</Text>
        </div>
        <div className="live-feed-list">
          <MotionPresence initial={false} mode="popLayout">
            {items.map((item) => {
              const actor = (
                <div className="live-feed-actor">
                  <span className="live-feed-avatar-slot">
                    {item.kind === "user" ? (
                      <img className="live-feed-avatar" src={item.avatarUrl} alt="" loading="lazy" />
                    ) : (
                      <ModelAvatar size={30} />
                    )}
                  </span>
                  <span className="live-feed-name">{item.name}</span>
                  {item.kind === "model" ? (
                    <Badge
                      color={modelTypeColor(item.modelType ?? "Machine Learning")}
                      size="sm"
                      variant="light"
                      className="live-feed-model-badge"
                    >
                      {item.modelType}
                    </Badge>
                  ) : null}
                </div>
              );

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 220, damping: 26, mass: 0.7 }}
                  className="live-feed-row"
                >
                  {item.kind === "model" && item.modelSlug ? (
                    <EntityHoverCard kind="model" slug={item.modelSlug} name={item.name}>
                      {actor}
                    </EntityHoverCard>
                  ) : item.kind === "user" && item.fakeUser ? (
                    <EntityHoverCard
                      kind="user"
                      username={item.name}
                      fakeUser={item.fakeUser.hoverProfile}
                      onProfileClick={onUserProfileClick}
                    >
                      {actor}
                    </EntityHoverCard>
                  ) : (
                    actor
                  )}
                  <EntityHoverCard kind="ticker" ticker={item.ticker} logoUrl={tickerLogos[item.ticker]}>
                    <div className="live-feed-ticker-cell">
                      <TickerLogoMark ticker={item.ticker} logoUrl={tickerLogos[item.ticker]} />
                      <span className="live-feed-ticker">{item.ticker}</span>
                    </div>
                  </EntityHoverCard>
                  <span
                    className={`live-feed-move ${item.predictedReturn >= 0 ? "live-feed-move-up" : "live-feed-move-down"}`}
                  >
                    {formatSignedPercent(item.predictedReturn)}
                  </span>
                  <span className="live-feed-horizon-label">
                    Prediction matures in {HORIZON_EXPIRY[item.horizon] ?? item.horizon}
                  </span>
                </motion.div>
              );
            })}
          </MotionPresence>
        </div>
      </section>
    </MagicHoverSurface>
  );
}

function fakeVerdictCounts(index: number): Partial<Record<ScoreVerdict, number>> {
  const called = index % 4 === 0 ? 1 : 0;
  const close = 1 + (index % 3);
  const zone = index % 5;
  const miss = index % 2 === 0 ? 1 : 2;
  const wayOff = index % 6 === 0 ? 1 : 0;
  const counts: Partial<Record<ScoreVerdict, number>> = {
    close_call: close,
    in_the_zone: zone,
    miss,
  };
  if (called > 0) counts.called_it = called;
  if (wayOff > 0) counts.way_off = wayOff;
  return counts;
}
