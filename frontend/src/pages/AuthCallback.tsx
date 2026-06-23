import { Loader, Text } from "@mantine/core";
import AnimatedSection from "../components/layout/AnimatedSection";

export default function AuthCallback() {
  return (
    <main className="dashboard-shell detail-page auth-callback-page">
      <AnimatedSection delay={0}>
        <div className="section-panel auth-callback-panel">
          <Loader color="green" />
          <Text fw={800}>Completing sign in</Text>
        </div>
      </AnimatedSection>
    </main>
  );
}

