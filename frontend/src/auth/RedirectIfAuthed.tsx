import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import RouteSplash from "../components/layout/RouteSplash";
import { useAuth } from "./AuthProvider";

// Gate, sends logged in users to dashboard
export default function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <RouteSplash />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
