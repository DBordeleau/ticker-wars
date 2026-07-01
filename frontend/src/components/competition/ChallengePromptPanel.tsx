import { Progress, Skeleton, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { FiFlag } from "react-icons/fi";
import { fetchChallengeDefinitions, type ChallengeDefinition } from "../../api/competition";
import { fetchOwnUserPredictions, type UserPrediction } from "../../api/userPredictions";
import { useAuth } from "../../auth/AuthProvider";
import SectionPanel from "../layout/SectionPanel";

export default function ChallengePromptPanel() {
  const { user } = useAuth();
  const [definitions, setDefinitions] = useState<ChallengeDefinition[]>([]);
  const [predictions, setPredictions] = useState<UserPrediction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchChallengeDefinitions()
      .then((rows) => {
        if (active) setDefinitions(rows);
      })
      .catch(() => {
        if (active) setDefinitions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      setPredictions([]);
      return undefined;
    }

    fetchOwnUserPredictions(user.id)
      .then((rows) => {
        if (active) setPredictions(rows);
      })
      .catch(() => {
        if (active) setPredictions([]);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const prompts = useMemo(
    () => definitions.map((definition) => buildPrompt(definition, predictions)).slice(0, 3),
    [definitions, predictions],
  );

  return (
    <SectionPanel
      title="Daily Challenges"
      subtitle="Small prompts that make the next prediction session feel purposeful."
      className="competition-panel"
    >
      {loading ? (
        <Skeleton height={116} radius="sm" />
      ) : prompts.length === 0 ? (
        <Text c="dimmed" size="sm">Challenges appear after the Phase 4 migration is applied.</Text>
      ) : (
        <div className="challenge-prompt-grid">
          {prompts.map((prompt) => (
            <div key={prompt.slug} className="challenge-prompt-card">
              <span className="challenge-prompt-icon" aria-hidden>
                <FiFlag />
              </span>
              <span className="challenge-prompt-copy">
                <strong>{prompt.name}</strong>
                <span>{prompt.description}</span>
              </span>
              <Progress value={prompt.progressPercent} size="sm" color="green" radius="xl" />
              <span className="challenge-prompt-foot">
                {prompt.progress}/{prompt.target} complete
                {prompt.xpReward > 0 ? ` - ${prompt.xpReward} XP` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

function buildPrompt(definition: ChallengeDefinition, predictions: UserPrediction[]) {
  const progress = progressForDefinition(definition, predictions);
  return {
    slug: definition.challenge_slug,
    name: definition.name,
    description: definition.description,
    progress,
    target: definition.target_count,
    progressPercent: Math.min(100, (progress / Math.max(definition.target_count, 1)) * 100),
    xpReward: definition.xp_reward,
  };
}

function progressForDefinition(
  definition: ChallengeDefinition,
  predictions: UserPrediction[],
): number {
  const activePredictions = predictions.filter((prediction) => prediction.status === "pending");
  if (definition.challenge_type === "active_horizons") {
    return new Set(activePredictions.map((prediction) => prediction.prediction_horizon)).size;
  }
  if (definition.challenge_type === "distinct_tickers") {
    return new Set(predictions.map((prediction) => prediction.ticker)).size;
  }
  if (definition.challenge_type === "close_call_or_better") {
    return predictions.filter((prediction) =>
      prediction.score?.score_verdict === "called_it" || prediction.score?.score_verdict === "close_call",
    ).length;
  }
  return 0;
}
