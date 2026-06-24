import { useState } from "react";
import { FiZap } from "react-icons/fi";
import { useAuth } from "../../auth/AuthProvider";
import SignInModal from "../users/SignInModal";

export default function DashboardHeader() {
  const { user, loading } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <header className="dashboard-header hero-header">
      <p className="hero-eyebrow">Multi-Horizon Market Predictions</p>
      <h1 className="hero-title">
        <span className="hero-title-text">Ticker Wars</span>
      </h1>
      {!user ? (
        <>
          <button
            type="button"
            className="hero-competition-cta"
            disabled={loading}
            onClick={() => setSignInOpen(true)}
          >
            <span className="hero-competition-cta-surface">
              <FiZap aria-hidden />
              <span>{loading ? "Loading..." : "Start competing"}</span>
            </span>
          </button>
          <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
        </>
      ) : null}
      <p className="hero-subtitle">
        A live leaderboard for machine-learning models competing across 1W, 1M, 3M, and 1Y market predictions.
      </p>
    </header>
  );
}
