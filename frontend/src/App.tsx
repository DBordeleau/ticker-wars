import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import AuthOnboardingRedirect from "./auth/AuthOnboardingRedirect";
import AuroraBackground from "./components/layout/AuroraBackground";
import UserControl from "./components/users/UserControl";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import ModelDetail from "./pages/ModelDetail";
import MyPredictions from "./pages/MyPredictions";
import Onboarding from "./pages/Onboarding";
import TickerDetail from "./pages/TickerDetail";
import { theme } from "./styles/theme";

export default function App() {
  return (
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <Notifications position="top-right" />
      <AuroraBackground />
      <AuthProvider>
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AuthOnboardingRedirect />
          <UserControl />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/me/profile" element={<Onboarding />} />
            <Route path="/me/predictions" element={<MyPredictions />} />
            <Route path="/models/:modelSlug" element={<ModelDetail />} />
            <Route path="/tickers/:ticker" element={<TickerDetail />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </MantineProvider>
  );
}
