import RulesLink from "../help/RulesLink";

export default function DashboardTopBar() {
  return (
    <div className="dashboard-rules-topbar">
      <h1 className="hero-title">
        <span className="hero-title-text">Ticker</span>
        <span className="accent">Wars</span>
      </h1>
      <RulesLink section="quick-start">How it works</RulesLink>
    </div>
  );
}
