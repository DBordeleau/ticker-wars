import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import AuthOnboardingRedirect from "./auth/AuthOnboardingRedirect";
import RedirectIfAuthed from "./auth/RedirectIfAuthed";
import RequireAuth from "./auth/RequireAuth";
import AuroraBackground from "./components/layout/AuroraBackground";
import ScrollManager from "./components/layout/ScrollManager";
import GamificationToasts from "./components/users/GamificationToasts";
import UserControl from "./components/users/UserControl";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import ModelDetail from "./pages/ModelDetail";
import MyPredictions from "./pages/MyPredictions";
import Onboarding from "./pages/Onboarding";
import Rules from "./pages/Rules";
import TickerDetail from "./pages/TickerDetail";
import TickerUniverse from "./pages/TickerUniverse";
import UserProfile, { MyProfileRedirect } from "./pages/UserProfile";
import { theme } from "./styles/theme";

export default function App() {
  return (
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <Notifications position="top-right" />
      <AuroraBackground />
      <AuthProvider>
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <ScrollManager />
          <AuthOnboardingRedirect />
          <UserControl />
          <GamificationToasts />
          <Routes>
            <Route
              path="/"
              element={
                <RedirectIfAuthed>
                  <Landing />
                </RedirectIfAuthed>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route
              path="/me/profile"
              element={
                <RequireAuth>
                  <MyProfileRedirect />
                </RequireAuth>
              }
            />
            <Route
              path="/me/predictions"
              element={
                <RequireAuth>
                  <MyPredictions />
                </RequireAuth>
              }
            />
            <Route path="/models/:modelSlug" element={<ModelDetail />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/tickers" element={<TickerUniverse />} />
            <Route path="/tickers/:ticker" element={<TickerDetail />} />
            <Route path="/users/:username" element={<UserProfile />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </MantineProvider>
  );
}
