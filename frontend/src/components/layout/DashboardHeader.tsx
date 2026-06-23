import UserControl from "../users/UserControl";

export default function DashboardHeader() {
  return (
    <header className="dashboard-header hero-header">
      <div className="dashboard-user-control-slot">
        <UserControl />
      </div>
      <p className="hero-eyebrow">Multi-Horizon Market Predictions</p>
      <h1 className="hero-title">
        <span className="hero-title-text">Ticker Wars</span>
      </h1>
      <p className="hero-subtitle">
        A live leaderboard for machine-learning models competing across 1W, 1M, 3M, and 1Y market predictions.
      </p>
    </header>
  );
}
