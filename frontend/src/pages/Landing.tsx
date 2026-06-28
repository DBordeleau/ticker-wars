import { Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMemo, useRef, useState } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import CompeteCtaButton from "../components/landing/CompeteCtaButton";
import FloatingCompeteCTA from "../components/landing/FloatingCompeteCTA";
import FloatingHeroTitle from "../components/landing/FloatingHeroTitle";
import LandingFaq from "../components/landing/LandingFaq";
import LandingHero from "../components/landing/LandingHero";
import LandingLeaderboard from "../components/landing/LandingLeaderboard";
import LivePredictionFeed from "../components/landing/LivePredictionFeed";
import ScrollCue from "../components/landing/ScrollCue";
import SectionShell from "../components/landing/SectionShell";
import StatusStrip from "../components/landing/StatusStrip";
import TickerLogoSphere from "../components/landing/TickerLogoSphere";
import SignInModal from "../components/users/SignInModal";

export default function Landing() {
  const dashboard = useDashboardData();
  const [signInOpen, setSignInOpen] = useState(false);
  const openSignIn = () => setSignInOpen(true);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const titleAnchorRef = useRef<HTMLHeadingElement>(null);

  const enableMorph = useMediaQuery("(min-width: 768px) and (hover: hover)") ?? false;
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)") ?? false;
  const morph = enableMorph && !reduceMotion;

  const tickerLogos = useMemo(
    () => Object.fromEntries(dashboard.tickerAssets.map((asset) => [asset.ticker, asset.logo_data_url])),
    [dashboard.tickerAssets],
  );

  const modelCount = useMemo(
    () =>
      dashboard.metadata?.model_count ??
      new Set(dashboard.leaderboard.map((row) => row.model_slug).filter((slug) => slug !== "baseline")).size,
    [dashboard.leaderboard, dashboard.metadata],
  );
  const modelPredictionCount = dashboard.metadata?.prediction_count ?? dashboard.latestPredictions.length;
  const userPredictionCount =
    dashboard.metadata?.user_prediction_count ?? dashboard.latestUserPredictions.length;

  return (
    <div className="landing-scroller" ref={scrollerRef}>
      <section className="landing-section landing-hero-section">
        <div className="landing-section-inner landing-hero-inner">
          <LandingHero
            ctaAnchorRef={anchorRef}
            titleAnchorRef={titleAnchorRef}
            hideTitle={morph}
            inlineCta={morph ? undefined : <CompeteCtaButton onClick={openSignIn} />}
            statusStrip={
              <StatusStrip
                metadata={dashboard.metadata}
                modelCount={modelCount}
                modelPredictionCount={modelPredictionCount}
                userPredictionCount={userPredictionCount}
              />
            }
          />
          <LivePredictionFeed tickerLogos={tickerLogos} />
        </div>
        <ScrollCue />
      </section>

      <SectionShell cue >
        <LandingLeaderboard
          modelRows={dashboard.leaderboard}
          userRows={dashboard.userLeaderboard}
          loading={dashboard.loading}
        />
      </SectionShell>

      <SectionShell cue>
        <div className="landing-sphere-block">
          <div className="landing-section-copy">
            <Text className="landing-section-eyebrow">50 of the market&apos;s most-watched assets</Text>
            <Text className="landing-section-title">Make predictions on the market's most speculative and valuable securities</Text>
            <Text className="landing-section-lead">
              Pick a ticker and put your read on the board against every model.
            </Text>
          </div>
          <TickerLogoSphere tickerLogos={tickerLogos} />
        </div>
      </SectionShell>

      <SectionShell auto>
        <LandingFaq metadata={dashboard.metadata} loading={dashboard.loading} />
      </SectionShell>

      {morph ? (
        <>
          <FloatingHeroTitle anchorRef={titleAnchorRef} scrollerRef={scrollerRef} />
          <FloatingCompeteCTA anchorRef={anchorRef} scrollerRef={scrollerRef} onClick={openSignIn} />
        </>
      ) : null}
      <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
