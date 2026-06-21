import { Group, Select, TextInput } from "@mantine/core";
import { FiSearch } from "react-icons/fi";

type Props = {
  tickerQuery: string;
  model: string | null;
  models: string[];
  onTickerQueryChange: (value: string) => void;
  onModelChange: (value: string | null) => void;
};

export default function PredictionFilters({
  tickerQuery,
  model,
  models,
  onTickerQueryChange,
  onModelChange,
}: Props) {
  return (
    <Group gap="sm" className="prediction-filters">
      <TextInput
        leftSection={<FiSearch />}
        placeholder="Search ticker"
        value={tickerQuery}
        onChange={(event) => onTickerQueryChange(event.currentTarget.value)}
        aria-label="Search latest predictions by ticker"
      />
      <Select
        placeholder="All models"
        data={models}
        value={model}
        onChange={onModelChange}
        clearable
        aria-label="Filter latest predictions by model"
      />
    </Group>
  );
}
