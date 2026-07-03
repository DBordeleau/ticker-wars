import { Accordion, Text } from "@mantine/core";
import type { RunMetadata } from "../../api/dashboardData";
import RulesLink from "../help/RulesLink";
import DashboardFooter from "../layout/DashboardFooter";
import MagicHoverSurface from "../layout/MagicHoverSurface";

type Props = {
  metadata: RunMetadata | null;
  loading: boolean;
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I make money with Ticker Wars?",
    a: "No. Ticker Wars is purely for fun. It is not a prediction market or investment platform.",
  },
  {
    q: "How are predictions scored?",
    a: "Once a prediction's target date arrives and the real closing price is known, we score it against the official close using percent error, horizon, and direction.",
  },
  {
    q: "Can I really compete against the models?",
    a: "Yes. Sign up, submit your own predictions on supported tickers and horizons, and your accuracy is ranked on the same leaderboard as the models.",
  },
  {
    q: "How often is everything updated?",
    a: "Fresh market data and a new round of model predictions land every weekday evening, around 7:30 PM Eastern.",
  },
  {
    q: "What models am I up against?",
    a: "A naive benchmark, classic machine-learning models, pretrained time-series foundation models, and an LLM value-investor bot — each making predictions across multiple horizons.",
  },
];

export default function LandingFaq({ metadata, loading }: Props) {
  return (
    <div className="landing-faq-wrap">
      <div className="landing-section-copy landing-faq-head">
        <Text className="landing-section-eyebrow">Learn more</Text>
        <Text className="landing-section-title">Frequently Asked Questions</Text>
      </div>
      <MagicHoverSurface className="landing-faq-surface">
        <Accordion
          className="landing-faq"
          chevronPosition="right"
          variant="separated"
          defaultValue="q-0"
        >
          {FAQ.map((item, index) => (
            <Accordion.Item key={item.q} value={`q-${index}`} className="landing-faq-item">
              <Accordion.Control>{item.q}</Accordion.Control>
              <Accordion.Panel>{item.a}</Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </MagicHoverSurface>
      <div className="landing-rules-link-row">
        <RulesLink section="quick-start">Read the full rules</RulesLink>
      </div>
      <DashboardFooter metadata={metadata} loading={loading} />
    </div>
  );
}
