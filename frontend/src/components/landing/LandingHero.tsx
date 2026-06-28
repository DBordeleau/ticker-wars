import { forwardRef } from "react";

type Props = {
  ctaAnchorRef?: React.Ref<HTMLDivElement>;
  inlineCta?: React.ReactNode;
  statusStrip?: React.ReactNode;
  // When the floating hero title is active, the in-flow title is kept (to reserve
  // its layout space) but hidden, and `FloatingHeroTitle` measures it via this ref.
  titleAnchorRef?: React.Ref<HTMLHeadingElement>;
  hideTitle?: boolean;
};

const LandingHero = forwardRef<HTMLElement, Props>(function LandingHero(
  { ctaAnchorRef, inlineCta, statusStrip, titleAnchorRef, hideTitle },
  ref,
) {
  return (
    <header className="dashboard-header hero-header landing-hero" ref={ref}>
      <p className="hero-eyebrow">Competitive stock forecasting</p>
      <h1
        className="hero-title"
        ref={titleAnchorRef}
        aria-hidden={hideTitle ? true : undefined}
        style={hideTitle ? { visibility: "hidden" } : undefined}
      >
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
