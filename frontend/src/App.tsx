import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AuroraBackground from "./components/layout/AuroraBackground";
import Dashboard from "./pages/Dashboard";
import ModelDetail from "./pages/ModelDetail";
import TickerDetail from "./pages/TickerDetail";
import { theme } from "./styles/theme";

export default function App() {
  return (
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <Notifications position="top-right" />
      <AuroraBackground />
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/models/:modelSlug" element={<ModelDetail />} />
          <Route path="/tickers/:ticker" element={<TickerDetail />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}
