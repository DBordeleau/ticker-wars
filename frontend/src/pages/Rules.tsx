import { Badge, Group, Table, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";
import DashboardFooter from "../components/layout/DashboardFooter";
import ScoreVerdictBadge from "../components/predictions/ScoreVerdictBadge";
import SectionPanel from "../components/layout/SectionPanel";
import { useDashboardData } from "../hooks/useDashboardData";
import { VERDICT_LABELS, VERDICT_THRESHOLDS_BY_HORIZON } from "../api/gamification";

const sections = [
  { id: "quick-start", label: "Quick Start" },
  { id: "predictions", label: "Making Predictions" },
  { id: "scoring", label: "Scoring & Leaderboards" },
  { id: "xp", label: "Progression" },
  { id: "models", label: "Models" },
  { id: "not-financial-advice", label: "Safety" },
];

const verdictOrder = [
  "called_it",
  "close_call",
  "in_the_zone",
  "miss",
  "way_off",
  "not_even_close",
] as const;

export default function Rules() {
  const { activeId, selectSection } = useActiveSection();
  const dashboard = useDashboardData();

  return (
    <main className="dashboard-shell rules-page">
      <BackToDashboardButton />

      <header className="rules-hero">
        <Text className="rules-eyebrow">Ticker Wars Help</Text>
        <Title order={1}>Rules</Title>
        <Text className="rules-lead">
          The essentials for making predictions, understanding results, and reading model
          performance.
        </Text>
      </header>

      <div className="rules-layout">
        <aside className="rules-toc">
          <nav aria-label="Rules sections">
            <p className="rules-toc-title">Contents</p>
            <ol className="rules-toc-list">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={activeId === section.id ? "true" : undefined}
                    onClick={() => selectSection(section.id)}
                  >
                    <span className="rules-toc-index">{index + 1}</span>
                    <span className="rules-toc-label">{section.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="rules-sections">
          <RulesSection id="quick-start" title="Quick Start">
            <ol className="rules-steps">
              <li><Link to="/tickers" className="text-link">Pick a supported ticker.</Link></li>
              <li>Choose a horizon: 1W, 1M, 3M, or 1Y.</li>
              <li>Predict the future closing price.</li>
              <li>Wait for the target close to become available.</li>
              <li>Get a verdict, XP, and possible badge progress.</li>
              <li>Build a public or private track record over time.</li>
            </ol>
          </RulesSection>

          <RulesSection id="predictions" title="Making And Managing Predictions">
            <Text>
              You may have one active prediction per ticker and horizon;
              submitting again for the same ticker/horizon updates the existing
              prediction instead of creating a duplicate.
            </Text>

            <div className="rules-subgrid">
              <RuleSubsection id="horizons" title="Horizons And Maturity">
                <Text>
                  Predictions can use 1W, 1M, 3M, or 1Y horizons.
                </Text>
                <Text>
                  A prediction matures when the target date has passed and the official close price for
                  that target is available. Predictions are scored automatically once they mature and settle.
                </Text>
              </RuleSubsection>

              <RuleSubsection id="editing" title="Editing Predictions">
                <Text>
                  Predictions can be edited until 1W before the target date.
                </Text>
                <ul className="rules-list">
                  <li>Editing resets the prediction date, reference price, target date, and scoring context.</li>
                  <li>Editing does not grant submission XP again.</li>
                </ul>
              </RuleSubsection>
            </div>
          </RulesSection>

          <RulesSection id="scoring" title="Scoring & Leaderboards">
            <RuleSubsection id="verdicts" title="Verdicts">
              <Text>
                Verdicts are based on percent error, horizon, and direction. The table is a rough
                guide to the current percent-error bands before direction adjustments. Open a scored
                prediction breakdown for the exact reason that prediction received its verdict.
              </Text>
              <Table.ScrollContainer minWidth={620}>
                <Table verticalSpacing="sm" className="rules-table">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Verdict</Table.Th>
                      <Table.Th>1W Error</Table.Th>
                      <Table.Th>1M Error</Table.Th>
                      <Table.Th>3M Error</Table.Th>
                      <Table.Th>1Y Error</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {verdictOrder.map((verdict, index) => (
                      <Table.Tr key={verdict}>
                        <Table.Td>
                          <ScoreVerdictBadge
                            score={{
                              score_verdict: verdict,
                              absolute_pct_error: VERDICT_THRESHOLDS_BY_HORIZON["1w"]?.[index] ?? 1,
                            }}
                        />
                      </Table.Td>
                      <Table.Td className="rules-table-center">{formatThreshold("1w", index)}</Table.Td>
                      <Table.Td className="rules-table-center">{formatThreshold("1m", index)}</Table.Td>
                      <Table.Td className="rules-table-center">{formatThreshold("3m", index)}</Table.Td>
                      <Table.Td className="rules-table-center">{formatThreshold("1y", index)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </RuleSubsection>

            <div className="rules-subgrid">
              <RuleSubsection id="privacy" title="Privacy">
                <Text>
                  Public profiles show active predictions. When making or editing a prediction,
                  you can hide the predicted price until maturity. Other users may still
                  see that you have an active prediction for that ticker and horizon, but the predicted price will be hidden.
                </Text>
                <Text>
                  Private users still earn XP and unlock badges, but they do not
                  appear in public profile lookup, latest prediction tables, or
                  public leaderboard projections.
                </Text>
              </RuleSubsection>

              <RuleSubsection id="leaderboards" title="Leaderboards">
                <Text>
                  Leaderboard rank is based on the margin of asbolute error (MAE).
                  Directional accuracy is the share of scored predictions that got
                  the movement direction right.
                </Text>
                <Text>
                  <a
                    href="https://mapie.readthedocs.io/en/v0.8.5/theoretical_description_metrics.html#mean-winkler-interval-score"
                    className="text-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Winkler score
                  </a>{" "}
                  applies to model interval predictions. User predictions are point
                  estimates, so user rows do not use Winkler. Rank movement updates when dashboard
                  projections refresh.
                </Text>
              </RuleSubsection>
            </div>
          </RulesSection>

          <RulesSection id="xp" title="Progression, Badges, And Profiles">
            <Text>
              Level up your account by making predictions, the more accurate, the faster you level up.
              Unlock badges by achieving milestones in accuracy, exploration, horizons, consistency, and public competition.
            </Text>

            <div className="rules-subgrid">
              <RuleSubsection title="XP And Levels">
                <ul className="rules-list">
                  <li>New predictions earn 10 XP.</li>
                  <li>Scored predictions earn base XP, a direction-hit bonus, and bonus XP based on the verdict.</li>
                  <li>Longer term horizons receive larger horizon multipliers.</li>
                  <li>Unlocking badges earns additional XP.</li>
                </ul>
              </RuleSubsection>

              <RuleSubsection id="badges" title="Badges">
                <Text>
                  Badges are unlockable items you can feature on your profile.
                  You can feature two unlocked badges on your profile and hover card.
                </Text>
                <Text>
                  Some badges require public leaderboard eligibility to unlock.
                </Text>
              </RuleSubsection>
            </div>
          </RulesSection>

          <RulesSection id="models" title="Models">
            <Text>
              The ML models including baseline are trained after every trading day.
              They ingest the latest available OHLCV data and fundamentals, then
              generate predictions. None of the models have access to current events,
              world news, or any other information outside of the supplied technicals/fundamentals.
            </Text>
            <Text>
              The classic machine-learning models train on historical OHLCV-derived features:
              recent returns, 1W/1M/3M/6M/1Y momentum, moving-average ratios, rolling volatility,
              RSI, volume changes, dollar volume, SPY market returns, and ticker performance
              relative to SPY. They learn from past examples of those features mapped to later
              realized returns.
            </Text>
          </RulesSection>

          <RulesSection id="not-financial-advice" title="Not Financial Advice">
            <Text>
              Ticker Wars is for fun. This is not a prediction market or gambling platform.
              More than 90% of professional fund managers fail to beat simple, low-cost index funds over long periods of time.
              Only a fool would think some basic models trained on historical data and random user predictions could give them the edge
              required to reliably outperform the market. Please do not use Ticker Wars to make real-world financial decisions.
            </Text>
            <Text size="sm" c="dimmed">
              Ready to play? Explore <Link to="/tickers" className="text-link">supported tickers</Link>.
            </Text>
          </RulesSection>
        </div>
      </div>

      <DashboardFooter metadata={dashboard.metadata} loading={dashboard.loading} />
    </main>
  );
}

// Scroll-spy for the table of contents. Two cooperating parts:
//
//   * Clicking a ToC link is authoritative: `selectSection` sets that section
//     active immediately and briefly locks the scroll handler, so the jump it
//     triggers can't reassign the highlight. This is what makes clicking a
//     section near the page bottom (where several short sections share the last
//     screen and can't be scrolled to the top) land on the right entry.
//   * Free scrolling uses a fixed activation line near the top — the last
//     section whose top has crossed it is active. When the page is scrolled to
//     the very bottom the trailing sections can never reach that line, so we pin
//     the final section instead.
function useActiveSection() {
  const [activeId, setActiveId] = useState(() => sectionIdFromCurrentHash() ?? sections[0]?.id ?? "");
  const lockUntilRef = useRef(0);

  useEffect(() => {
    const applyHashSelection = () => {
      const hashSection = sectionIdFromCurrentHash();
      if (!hashSection) {
        return;
      }
      lockUntilRef.current = Date.now() + 900;
      setActiveId(hashSection);
    };

    const computeActive = () => {
      if (Date.now() < lockUntilRef.current) {
        return;
      }

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 0 && window.scrollY >= maxScroll - 2) {
        setActiveId(sectionIdFromCurrentHash() ?? sections[sections.length - 1]?.id ?? "");
        return;
      }

      const activationLine = 120;
      let current = sections[0]?.id ?? "";
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (!element) {
          continue;
        }
        if (element.getBoundingClientRect().top <= activationLine) {
          current = section.id;
        } else {
          break;
        }
      }
      setActiveId(current);
    };

    applyHashSelection();
    computeActive();
    window.addEventListener("hashchange", applyHashSelection);
    window.addEventListener("scroll", computeActive, { passive: true });
    window.addEventListener("resize", computeActive);
    return () => {
      window.removeEventListener("hashchange", applyHashSelection);
      window.removeEventListener("scroll", computeActive);
      window.removeEventListener("resize", computeActive);
    };
  }, []);

  const selectSection = useCallback((id: string) => {
    lockUntilRef.current = Date.now() + 700;
    setActiveId(id);
  }, []);

  return { activeId, selectSection };
}

function sectionIdFromCurrentHash() {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    return null;
  }

  let id = hash;
  try {
    id = decodeURIComponent(hash);
  } catch {
    id = hash;
  }

  const directSection = sections.find((section) => section.id === id);
  if (directSection) {
    return directSection.id;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const target = document.getElementById(id);
  if (!target) {
    return null;
  }

  return (
    sections.find((section) => {
      const sectionElement = document.getElementById(section.id);
      return sectionElement?.contains(target);
    })?.id ?? null
  );
}

function RulesSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rules-section">
      <SectionPanel title={title}>{children}</SectionPanel>
    </section>
  );
}

function RuleSubsection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rules-subsection">
      <Title order={3}>{title}</Title>
      {children}
    </section>
  );
}

function formatThreshold(horizon: string, index: number) {
  const value = VERDICT_THRESHOLDS_BY_HORIZON[horizon]?.[index];
  if (value == null) {
    return "Above prior band";
  }
  return `<= ${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}
