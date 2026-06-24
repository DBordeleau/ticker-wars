import { Alert, Button, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck } from "react-icons/fi";
import type { LatestPrediction, MetricHorizon } from "../../api/dashboardData";
import {
  editUserPrediction,
  findPendingPrediction,
  getPredictionTargets,
  isPredictionEditable,
  submitUserPrediction,
  type PredictionTarget,
  type UserPrediction,
} from "../../api/userPredictions";
import { useAuth } from "../../auth/AuthProvider";
import { formatCurrency, formatDate, formatHorizon } from "../../utils/format";

type Props = {
  ticker: string;
  latestPredictions: LatestPrediction[];
  existingPrediction?: UserPrediction | null;
  onSaved?: (prediction: UserPrediction) => void;
  onCancel?: () => void;
};

export default function UserPredictionForm({
  ticker,
  latestPredictions,
  existingPrediction,
  onSaved,
  onCancel,
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingPrediction) {
      setHorizon(existingPrediction.prediction_horizon);
      setPredictedClose(existingPrediction.predicted_close);
    }
  }, [existingPrediction]);

  const canSubmit = Boolean(user && selectedTarget && typeof predictedClose === "number" && predictedClose > 0);

  const handleSubmit = async () => {
    if (!user || !selectedTarget || typeof predictedClose !== "number") {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const input = {
        userId: user.id,
        target: selectedTarget as PredictionTarget,
        predictedClose,
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
          message: `${ticker} ${formatHorizon(selectedTarget.horizon)} now matures on ${formatDate(selectedTarget.targetDate)}.`,
        });
        onSaved?.(edited);
        return;
      }

      const created = await submitUserPrediction(input);
      notifications.show({
        color: "green",
        icon: <FiCheck />,
        title: "Prediction made",
        message: `${ticker} ${formatHorizon(selectedTarget.horizon)} matures on ${formatDate(selectedTarget.targetDate)}.`,
      });
      onSaved?.(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save prediction.");
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
      <Text fw={800}>Make a prediction</Text>
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
          comboboxProps={{ withinPortal: true, zIndex: 420 }}
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
            Reference close
          </Text>
          <Text fw={800}>{formatCurrency(selectedTarget.referenceClose)}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Matures on
          </Text>
          <Text fw={800}>{formatDate(selectedTarget.targetDate)}</Text>
        </div>
      </Group>
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

