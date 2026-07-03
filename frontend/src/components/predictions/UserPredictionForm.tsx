import { Alert, Button, Group, NumberInput, Select, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck } from "react-icons/fi";
import type { LatestPrediction, MetricHorizon } from "../../api/dashboardData";
import { dispatchProgressionRefresh } from "../../api/gamification";
import { resolveTickerDisplayPrice } from "../../api/livePrices";
import {
  editUserPrediction,
  findPendingPrediction,
  getPredictionTargets,
  isPredictionEditable,
  submitUserPrediction,
  type UserPrediction,
} from "../../api/userPredictions";
import { useAuth } from "../../auth/AuthProvider";
import { useLiveTickerPrice } from "../../hooks/useLiveTickerPrice";
import { useTickerCloseSnapshot } from "../../hooks/useTickerCloseSnapshot";
import { formatCurrency, formatDate, formatHorizon } from "../../utils/format";
import RulesLink from "../help/RulesLink";

type Props = {
  ticker: string;
  latestPredictions: LatestPrediction[];
  existingPrediction?: UserPrediction | null;
  onSaved?: (prediction: UserPrediction) => void;
  onCancel?: () => void;
  // When the form lives inside a click-outside-closable popover, the horizon
  // Select must render in-place (not portaled to body) so picking an option does
  // not register as a click outside the popover and dismiss it.
  comboboxWithinPortal?: boolean;
};

export default function UserPredictionForm({
  ticker,
  latestPredictions,
  existingPrediction,
  onSaved,
  onCancel,
  comboboxWithinPortal = true,
}: Props) {
  const { user } = useAuth();
  const targets = useMemo(
    () => getPredictionTargets(ticker, latestPredictions),
    [latestPredictions, ticker],
  );
  const initialTarget =
    targets.find((target) => target.horizon === existingPrediction?.prediction_horizon) ?? targets[0];
  const [horizon, setHorizon] = useState<MetricHorizon>(initialTarget?.horizon ?? "1w");
  const selectedTarget = targets.find((target) => target.horizon === horizon) ?? initialTarget;
  const [predictedClose, setPredictedClose] = useState<number | "">(
    existingPrediction?.predicted_close ?? "",
  );
  const [hideDetailsUntilScored, setHideDetailsUntilScored] = useState(
    existingPrediction?.hide_details_until_scored ?? false,
  );
  const livePrice = useLiveTickerPrice(ticker, { poll: true, pollMs: 45_000 });
  const closeSnapshot = useTickerCloseSnapshot(ticker);
  const displayPrice = resolveTickerDisplayPrice(livePrice.data, closeSnapshot.data);
  const referenceIsStale = displayPrice?.source === "live" && displayPrice.freshness === "stale";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingPrediction) {
      setHorizon(existingPrediction.prediction_horizon);
      setPredictedClose(existingPrediction.predicted_close);
      setHideDetailsUntilScored(existingPrediction.hide_details_until_scored);
    }
  }, [existingPrediction]);

  const canSubmit = Boolean(
    user &&
      selectedTarget &&
      displayPrice &&
      !referenceIsStale &&
      typeof predictedClose === "number" &&
      predictedClose > 0,
  );

  const handleSubmit = async () => {
    if (!user || !selectedTarget || typeof predictedClose !== "number") {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const input = {
        ticker: selectedTarget.ticker,
        horizon: selectedTarget.horizon,
        predictedClose,
        hideDetailsUntilScored,
      };
      const pending = existingPrediction
        ? existingPrediction
        : await findPendingPrediction(user.id, selectedTarget.ticker, selectedTarget.horizon);

      if (pending) {
        if (!isPredictionEditable(pending)) {
          setError("That ticker and horizon already has a locked active prediction.");
          return;
        }

        const edited = await editUserPrediction(pending, input);
        notifications.show({
          color: "green",
          icon: <FiCheck />,
          title: "Prediction updated",
          message: `${ticker} ${formatHorizon(edited.prediction_horizon)} now uses ${formatDate(edited.prediction_date)} as its prediction date and matures on ${formatDate(edited.target_date)}.${edited.hide_details_until_scored ? " Details are hidden publicly until scoring." : ""}`,
        });
        dispatchProgressionRefresh();
        onSaved?.(edited);
        return;
      }

      const created = await submitUserPrediction(input);
      notifications.show({
          color: "green",
          icon: <FiCheck />,
          title: "Prediction made",
          message: `${ticker} ${formatHorizon(created.prediction_horizon)} matures on ${formatDate(created.target_date)}. +10 XP${created.hide_details_until_scored ? " Details are hidden publicly until scoring." : ""}`,
        });
      dispatchProgressionRefresh();
      onSaved?.(created);
    } catch (caught) {
      setError(saveErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!selectedTarget) {
    return (
      <Alert color="yellow" icon={<FiAlertTriangle />}>
        This ticker does not have a current dashboard target to anchor a user prediction.
      </Alert>
    );
  }

  return (
    <Stack gap="md" className="user-prediction-form">
      {error ? (
        <Alert color="red" icon={<FiAlertTriangle />}>
          {error}
        </Alert>
      ) : null}
      <Group justify="space-between" align="center" gap="sm">
        <Text fw={800}>{existingPrediction ? "Edit prediction" : "Make a prediction"}</Text>
        <RulesLink section={existingPrediction ? "editing" : "predictions"} compact>
          {existingPrediction ? "Editing rules" : "Prediction rules"}
        </RulesLink>
      </Group>
      <div className="prediction-sentence">
        <span>I think {ticker} will be</span>
        <NumberInput
          aria-label="Predicted price"
          value={predictedClose}
          min={0.01}
          decimalScale={2}
          fixedDecimalScale
          prefix="$"
          placeholder="0.00"
          onChange={(value) => setPredictedClose(typeof value === "number" ? value : "")}
        />
        <Select
          aria-label="Prediction horizon"
          value={horizon}
          comboboxProps={{ withinPortal: comboboxWithinPortal, zIndex: 420 }}
          data={targets.map((target) => ({
            value: target.horizon,
            label: `${formatHorizon(target.horizon)} from today`,
          }))}
          onChange={(value) => setHorizon((value as MetricHorizon | null) ?? horizon)}
        />
      </div>
      <Group gap="lg">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Reference price
          </Text>
          <Text fw={800}>{formatCurrency(displayPrice?.price)}</Text>
          {displayPrice ? (
            <Text size="xs" c={referenceIsStale ? "orange" : "dimmed"} fw={700}>
              {referenceIsStale
                ? "Waiting for fresh live reference"
                : displayPrice.detailLabel
                  ? `${displayPrice.label} - ${displayPrice.detailLabel}`
                  : displayPrice.label}
            </Text>
          ) : livePrice.loading || closeSnapshot.loading ? (
            <Text size="xs" c="dimmed" fw={700}>
              Loading reference...
            </Text>
          ) : null}
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Matures on
          </Text>
          <Text fw={800}>{formatDate(selectedTarget.targetDate)}</Text>
        </div>
      </Group>
      <Text size="xs" c="dimmed" className="prediction-rules-note">
        New predictions earn 10 XP now. Edits reset the prediction date, target date, reference
        price, and scoring context. Final XP arrives after the official close is scored.{" "}
        <RulesLink
          section="scoring"
          compact
          iconOnly
          className="prediction-inline-rule-icon"
          tooltipLabel="Learn more about scoring predictions."
        >
          Scoring guide
        </RulesLink>
      </Text>
      <Switch
        checked={hideDetailsUntilScored}
        onChange={(event) => setHideDetailsUntilScored(event.currentTarget.checked)}
        label="Hide prediction details until this prediction has matured."
        description={
          <>
            Your profile can still show that you have an active prediction, but the predicted price and return stay hidden until it is scored.{" "}
            <RulesLink
              section="privacy"
              compact
              iconOnly
              className="prediction-inline-rule-icon"
              tooltipLabel="Learn more about prediction privacy."
            >
              Privacy rules
            </RulesLink>
          </>
        }
        color="green"
        className="prediction-privacy-switch"
      />
      <Group justify="flex-end">
        {onCancel ? (
          <Button variant="subtle" color="gray" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button color="green" disabled={!canSubmit} loading={saving} onClick={() => void handleSubmit()}>
          {existingPrediction ? "Update prediction" : "Make prediction"}
        </Button>
      </Group>
    </Stack>
  );
}

function saveErrorMessage(caught: unknown) {
  if (caught instanceof Error && caught.message) {
    return caught.message;
  }
  if (isRecord(caught) && typeof caught.message === "string" && caught.message.trim()) {
    return caught.message;
  }
  return "Unable to save prediction.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

