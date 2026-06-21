import { Text, Title } from "@mantine/core";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { LatestPrediction } from "../../api/dashboardData";
import WarrenBuffbotHead from "./WarrenBuffbotHead";

type Props = {
  latestPrediction?: LatestPrediction;
};

export default function WarrenBuffbotPanel({ latestPrediction }: Props) {
  const metadata = latestPrediction?.model_metadata ?? {};
  const provider = typeof metadata.provider === "string" ? metadata.provider : null;
  const model = typeof metadata.model === "string" ? metadata.model : null;
  const reasoning = latestPrediction?.reasoning_summary?.trim() || "No prediction has been made.";
  const typedReasoning = useTypedText(reasoning);

  return (
    <section className="buffbot-panel">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
        <WarrenBuffbotHead />
      </motion.div>
      <motion.div
        className="speech-bubble"
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.12 }}
      >
        <Title order={2} className="speech-bubble-title">
          Warren Buffbot
        </Title>
        <Text className="speech-bubble-text" mt={4} aria-label={reasoning}>
          <span className="speech-text-measure">
            {reasoning}
          </span>
          <span className="speech-text-visible">
            {typedReasoning}
          </span>
        </Text>
        {provider || model ? (
          <Text c="dimmed" size="xs" mt="sm">
            {provider ?? "Provider unknown"} {model ? `| ${model}` : ""}
          </Text>
        ) : null}
      </motion.div>
    </section>
  );
}

function useTypedText(text: string) {
  const [visibleLength, setVisibleLength] = useState(0);
  const intervalMs = useMemo(() => {
    if (text.length === 0) {
      return 12;
    }

    return Math.max(8, Math.min(22, Math.floor(1500 / text.length)));
  }, [text.length]);

  useEffect(() => {
    setVisibleLength(0);

    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, text]);

  return text.slice(0, visibleLength);
}
