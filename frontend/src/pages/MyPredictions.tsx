import { Card, Text, Title } from "@mantine/core";
import AnimatedSection from "../components/layout/AnimatedSection";
import BackToDashboardButton from "../components/layout/BackToDashboardButton";

export default function MyPredictions() {
  return (
    <main className="dashboard-shell detail-page">
      <AnimatedSection delay={0}>
        <BackToDashboardButton />
      </AnimatedSection>
      <AnimatedSection delay={0.08}>
        <Card className="model-hero">
          <Text className="eyebrow">Human predictions</Text>
          <Title order={1}>My Predictions</Title>
          <Text mt="sm" className="model-description">
            Your prediction history will appear here after prediction submission is added.
          </Text>
        </Card>
      </AnimatedSection>
    </main>
  );
}
