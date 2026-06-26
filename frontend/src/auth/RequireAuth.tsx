import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import RouteSplash from "../components/layout/RouteSplash";
import { useAuth } from "./AuthProvider";

// Gate for authenticated-only routes (e.g. /dashboard, /me/*). 
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <RouteSplash />;
  }
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
