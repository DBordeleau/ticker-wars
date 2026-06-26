import { Title } from "@mantine/core";
import { useAuth } from "../../auth/AuthProvider";

export default function DashboardTopBar() {
  const { profile } = useAuth();
  const name = profile?.display_username;

  return (
    <h1 className="hero-title">
      <span className="hero-title-text">Ticker</span>
      <span className="accent">Wars</span>
    </h1>
  );
}
