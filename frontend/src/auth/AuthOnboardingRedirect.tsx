import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

const allowedWithoutProfile = new Set(["/onboarding", "/auth/callback"]);

export default function AuthOnboardingRedirect() {
  const { user, profile, loading, profileLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || profileLoading || !user || profile || allowedWithoutProfile.has(location.pathname)) {
      return;
    }

    navigate("/onboarding", { replace: true, state: { from: location.pathname } });
  }, [loading, location.pathname, navigate, profile, profileLoading, user]);

  return null;
}

