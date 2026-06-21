import { Alert, Button } from "@mantine/core";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { FiAlertTriangle, FiDatabase } from "react-icons/fi";

type Props = {
  children: ReactNode;
  error?: string | null;
  hasSupabaseConfig: boolean;
  onRetry: () => void;
};

export default function DashboardShell({ children, error, hasSupabaseConfig, onRetry }: Props) {
  return (
    <main className="dashboard-shell">
      {!hasSupabaseConfig ? (
        <Alert className="config-alert" color="yellow" icon={<FiDatabase />}>
          The React build cannot see <code>REACT_APP_SUPABASE_URL</code> and{" "}
          <code>REACT_APP_SUPABASE_PUBLISHABLE_KEY</code>. CRA reads frontend env files from{" "}
          <code>frontend/.env*</code> when launched from the frontend directory.
        </Alert>
      ) : null}

      {error ? (
        <Alert
          className="config-alert"
          color="red"
          icon={<FiAlertTriangle />}
          title="Dashboard data could not be loaded"
        >
          <div className="error-alert-content">
            <span>{error}</span>
            <Button variant="light" color="red" size="xs" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      <motion.div
        initial="hidden"
        animate="visible"
        className="dashboard-entry"
      >
        {children}
      </motion.div>
    </main>
  );
}
