import { Group, Text, Tooltip } from "@mantine/core";
import { FiEyeOff } from "react-icons/fi";

type Props = {
  compact?: boolean;
};

export default function PredictionPrivacyIndicator({ compact = false }: Props) {
  const content = (
    <Group gap={6} wrap="nowrap" className="prediction-privacy-indicator">
      <FiEyeOff aria-hidden />
      {compact ? null : (
        <Text size="xs" fw={800}>
          Hidden until scored
        </Text>
      )}
    </Group>
  );

  return compact ? (
    <Tooltip label="Prediction details hidden until this prediction matures." openDelay={250}>
      {content}
    </Tooltip>
  ) : content;
}
