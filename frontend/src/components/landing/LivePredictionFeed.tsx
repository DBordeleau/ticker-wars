import { Badge, Text } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { MetricHorizon } from "../../api/dashboardData";
import { avatarOptionsFromSeed, buildDiceBearAvatarUrl } from "../../auth/avatar";
import { formatSignedPercent } from "../../utils/format";
import { modelTypeColor, type ModelType } from "../../utils/models";
import EntityHoverCard from "../cards/EntityHoverCard";
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
};

type FeedItem = {
  id: number;
  kind: "model" | "user";
  name: string;
  modelSlug?: string;
  modelType?: ModelType;
  avatarUrl?: string;
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
  "KilljoyTheCat", "gabrielwingue"
];

type FakeUser = { name: string; avatarUrl: string };
const USER_POOL: FakeUser[] = USERNAMES.map((name, index) => {
  const seed = `tw-${name}-${index}`;
  return { name, avatarUrl: buildDiceBearAvatarUrl(seed, avatarOptionsFromSeed(seed)) };
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
function makeItem(): FeedItem {
  const isUser = Math.random() < 0.5;
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
    return { ...base, name: user.name, avatarUrl: user.avatarUrl };
  }
  const model = pick(MODEL_POOL);
  return { ...base, name: model.name, modelSlug: model.slug, modelType: model.type };
}

export default function LivePredictionFeed({ tickerLogos }: Props) {
  const [items, setItems] = useState<FeedItem[]>(() => Array.from({ length: VISIBLE }, makeItem));
  const pausedRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      setItems((current) => [makeItem(), ...current].slice(0, VISIBLE));
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
