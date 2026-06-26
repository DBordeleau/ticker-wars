import { forwardRef } from "react";

type Props = {
  ctaAnchorRef?: React.Ref<HTMLDivElement>;
  inlineCta?: React.ReactNode;
  statusStrip?: React.ReactNode;
};

const LandingHero = forwardRef<HTMLElement, Props>(function LandingHero(
  { ctaAnchorRef, inlineCta, statusStrip },
  ref,
) {
  return (
    <header className="dashboard-header hero-header landing-hero" ref={ref}>
      <p className="hero-eyebrow">Competitive stock forecasting</p>
      <h1 className="hero-title">
        <span className="hero-title-text">Ticker </span>
        <span className="accent">Wars</span>
      </h1>
      <div className="compete-cta-anchor" ref={ctaAnchorRef}>
        {inlineCta}
      </div>
      <p className="hero-subtitle">
        A stock price prediction platform where users and machine learning models compete to predict future prices.
      </p>
      {statusStrip}
    </header>
  );
});

export default LandingHero;
