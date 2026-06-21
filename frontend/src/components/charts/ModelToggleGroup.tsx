import { Checkbox, Group } from "@mantine/core";

type Props = {
  models: string[];
  visibleModels: string[];
  onChange: (models: string[]) => void;
};

export default function ModelToggleGroup({ models, visibleModels, onChange }: Props) {
  return (
    <Checkbox.Group value={visibleModels} onChange={onChange} aria-label="Visible model lines">
      <Group gap="xs" className="model-toggle-group">
        {models.map((model) => (
          <Checkbox.Card key={model} value={model} className="model-toggle">
            <Checkbox.Indicator />
            <span>{model}</span>
          </Checkbox.Card>
        ))}
      </Group>
    </Checkbox.Group>
  );
}
