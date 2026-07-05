import { Loader, Modal, TextInput } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { AnimatePresence as FramerAnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { FiArrowLeft, FiSearch, FiX } from "react-icons/fi";
import { TbTargetArrow } from "react-icons/tb";
import { isRemovedTicker } from "../../api/tickerUniverse";
import { useDashboardData } from "../../hooks/useDashboardData";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import SwipeSheet from "../layout/SwipeSheet";
import TickerLogoMark from "../tickers/TickerLogoMark";
import UserPredictionForm from "./UserPredictionForm";

// framer-motion's AnimatePresence trips the project's JSX typings; cast it to a
// component with just the props we use (same workaround as UserControl).
const AnimatePresence = FramerAnimatePresence as unknown as (props: {
  children: ReactNode;
  mode?: "wait" | "sync" | "popLayout";
  initial?: boolean;
}) => JSX.Element;

type Props = {
  opened: boolean;
  onClose: () => void;
};

const VALID_HORIZONS = new Set(["1w", "1m", "3m", "1y"]);

const stepTransition = {
  duration: 0.24,
  ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
};

// The nav "Predict" CTA opens this. Unlike the per-ticker prediction button, it
// lets the user pick any playable ticker first, then drops them into the shared
// prediction form for that ticker/horizon.
export default function QuickPredictModal({ opened, onClose }: Props) {
  const isMobile = useMediaQuery("(max-width: 760px)") ?? false;

  if (isMobile) {
    return (
      <SwipeSheet
        opened={opened}
        onClose={onClose}
        drawerClassName="quick-predict-drawer"
        panelClassName="quick-predict-sheet"
        aria-label="Make a prediction"
      >
        {opened ? <QuickPredictContent onClose={onClose} /> : null}
      </SwipeSheet>
    );
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      withCloseButton={false}
      padding={0}
      size={560}
      className="quick-predict-modal"
      overlayProps={{ backgroundOpacity: 0.55, blur: 9 }}
      transitionProps={{ transition: "pop", duration: 220 }}
    >
      {opened ? <QuickPredictContent onClose={onClose} /> : null}
    </Modal>
  );
}

function QuickPredictContent({ onClose }: { onClose: () => void }) {
  const { latestPredictions, tickerAssets, loading } = useDashboardData();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const logoByTicker = useMemo(() => {
    const map = new Map<string, string | null>();
    tickerAssets.forEach((asset) => map.set(asset.ticker, asset.logo_data_url));
    return map;
  }, [tickerAssets]);

  // Only tickers with at least one valid dashboard horizon target can anchor a
  // prediction, so those are the only ones we offer.
  const tickers = useMemo(() => {
    const playable = new Set<string>();
    for (const row of latestPredictions) {
      if (VALID_HORIZONS.has(row.prediction_horizon) && !isRemovedTicker(row.ticker)) {
        playable.add(row.ticker);
      }
    }
    return Array.from(playable).sort();
  }, [latestPredictions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toUpperCase();
    if (!needle) {
      return tickers;
    }
    return tickers.filter((ticker) => ticker.includes(needle));
  }, [query, tickers]);

  return (
    <MagicHoverSurface className="prediction-magic-surface quick-predict-surface">
      <div className="prediction-surface-card quick-predict">
        <div className="quick-predict-head">
          <div className="quick-predict-heading">
            <span className="quick-predict-eyebrow">
              <TbTargetArrow />
              New prediction
            </span>
            <h2 className="quick-predict-title">
              {selected ? `Predict ${selected}` : "Pick a ticker"}
            </h2>
          </div>
          <button
            type="button"
            className="quick-predict-close"
            aria-label="Close"
            onClick={onClose}
          >
            <FiX />
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <motion.div
              key="form"
              className="quick-predict-step"
              initial={{ opacity: 0, x: 26 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 26 }}
              transition={stepTransition}
            >
              <div className="quick-predict-selected-row">
                <button
                  type="button"
                  className="quick-predict-back"
                  onClick={() => setSelected(null)}
                >
                  <FiArrowLeft />
                  All tickers
                </button>
                <span className="quick-predict-selected">
                  <TickerLogoMark ticker={selected} logoUrl={logoByTicker.get(selected)} size="md" />
                  <span className="quick-predict-selected-symbol">{selected}</span>
                </span>
              </div>
              <UserPredictionForm
                ticker={selected}
                latestPredictions={latestPredictions}
                onSaved={onClose}
              />
            </motion.div>
          ) : (
            <motion.div
              key="picker"
              className="quick-predict-step"
              initial={{ opacity: 0, x: -26 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -26 }}
              transition={stepTransition}
            >
              <TextInput
                className="quick-predict-search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search ticker"
                leftSection={<FiSearch />}
                aria-label="Search tickers"
                autoFocus
              />
              {tickers.length === 0 ? (
                <div className="quick-predict-status">
                  {loading ? (
                    <>
                      <Loader size="sm" color="green" />
                      <span>Loading tickers…</span>
                    </>
                  ) : (
                    <span>No playable tickers are available right now.</span>
                  )}
                </div>
              ) : filtered.length === 0 ? (
                <div className="quick-predict-status">
                  <span>No tickers match “{query.trim()}”.</span>
                </div>
              ) : (
                <div className="quick-predict-grid" role="listbox" aria-label="Tickers">
                  {filtered.map((ticker) => (
                    <button
                      key={ticker}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="quick-predict-ticker"
                      onClick={() => setSelected(ticker)}
                    >
                      <TickerLogoMark ticker={ticker} logoUrl={logoByTicker.get(ticker)} size="md" />
                      <span className="quick-predict-ticker-symbol">{ticker}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MagicHoverSurface>
  );
}
