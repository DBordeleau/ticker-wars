import {
  normalizeVerdictCounts,
  resolvePublicProfileVerdictCounts,
  type PublicUserProfileBundle,
} from "./publicProfiles";

test("normalizes verdict count keys from projected JSON", () => {
  expect(normalizeVerdictCounts({ Miss: "2", "Way off": 1, "not-even-close": 0 })).toEqual({
    miss: 2,
    way_off: 1,
  });
});

test("repairs incomplete profile verdict counts from scored profile predictions", () => {
  const bundle = {
    profile: {
      scored_count: 3,
      verdict_counts: { miss: 2 },
    },
    predictions: [
      scoredPrediction("miss", 0.07, "1m", 1),
      scoredPrediction("miss", 0.08, "1m", 1),
      scoredPrediction("way_off", 0.1, "1w", 1),
    ],
  } as PublicUserProfileBundle;

  expect(resolvePublicProfileVerdictCounts(bundle)).toEqual({
    miss: 2,
    way_off: 1,
  });
});

function scoredPrediction(
  scoreVerdict: string,
  absolutePctError: number,
  predictionHorizon: "1w" | "1m" | "3m" | "1y",
  directionCorrect: number,
) {
  return {
    status: "scored",
    score_verdict: scoreVerdict,
    absolute_pct_error: absolutePctError,
    prediction_horizon: predictionHorizon,
    direction_correct: directionCorrect,
  };
}
