export default function DashboardHeader() {
  return (
    <header className="dashboard-header hero-header">
      <p className="hero-eyebrow">Machine Learning Price Prediction</p>
      <h1 className="hero-title">
        <span className="hero-title-text">Next Day Price</span>
      </h1>
      <p className="hero-subtitle">
        A live leaderboard for machine-learning models competing to predict tomorrow's closing price.
      </p>
    </header>
  );
}
