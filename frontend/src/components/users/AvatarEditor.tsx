import { Button, Group, Loader, SimpleGrid, Slider, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { avatarSkinColors, buildDiceBearAvatarUrl, defaultAvatarOptions, normalizeAvatarOptions } from "../../auth/avatar";
import type { AvatarOptions } from "../../auth/types";

type DiceBearOption = {
  type: string;
  values?: string[];
  min?: number;
  max?: number;
};

type DiceBearMetadata = Record<string, DiceBearOption>;

type Props = {
  seed: string;
  value: AvatarOptions;
  onChange: (value: AvatarOptions) => void;
};

const metadataUrl = "https://api.dicebear.com/10.x/adventurer-neutral/options.json";
const metadataCacheKey = "dicebear:adventurer-neutral:10.x:options";

const fallbackMetadata: DiceBearMetadata = {
  eyebrowsVariant: { type: "enum", values: variants(15) },
  eyesVariant: { type: "enum", values: variants(26) },
  glassesVariant: { type: "enum", values: variants(5) },
  mouthVariant: { type: "enum", values: variants(30) },
  backgroundColor: { type: "color" },
  scale: { type: "range", min: 0, max: 10 },
  rotate: { type: "range", min: -360, max: 360 },
};

export default function AvatarEditor({ seed, value, onChange }: Props) {
  const [metadata, setMetadata] = useState<DiceBearMetadata>(fallbackMetadata);
  const [loading, setLoading] = useState(false);
  const avatarOptions = normalizeAvatarOptions(value);
  const previewUrl = useMemo(
    () => buildDiceBearAvatarUrl(seed, avatarOptions),
    [avatarOptions, seed],
  );

  useEffect(() => {
    const cached = sessionStorage.getItem(metadataCacheKey);
    if (cached) {
      setMetadata({ ...fallbackMetadata, ...JSON.parse(cached) });
      return;
    }

    setLoading(true);
    fetch(metadataUrl)
      .then((response) => response.json())
      .then((data: DiceBearMetadata) => {
        sessionStorage.setItem(metadataCacheKey, JSON.stringify(data));
        setMetadata({ ...fallbackMetadata, ...data });
      })
      .catch(() => setMetadata(fallbackMetadata))
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<AvatarOptions>) => {
    onChange(normalizeAvatarOptions({ ...avatarOptions, ...patch }));
  };

  return (
    <div className="avatar-editor">
      <div className="avatar-preview-panel">
        <img src={previewUrl} alt="Avatar preview" className="avatar-preview-image" />
        <div>
          <Title order={3} className="avatar-editor-title">
            Avatar
          </Title>
          <Text size="sm" className="secondary-text">
            {loading ? (
              <span className="avatar-options-loading">
                <Loader size="xs" /> Loading options
              </span>
            ) : (
              "Adventurer-neutral"
            )}
          </Text>
        </div>
      </div>

      <Stack gap="lg">
        <VariantPicker
          label="Eyebrows"
          values={metadata.eyebrowsVariant?.values ?? fallbackMetadata.eyebrowsVariant.values ?? []}
          selected={avatarOptions.eyebrowsVariant}
          onSelect={(eyebrowsVariant) => update({ eyebrowsVariant })}
        />
        <VariantPicker
          label="Eyes"
          values={metadata.eyesVariant?.values ?? fallbackMetadata.eyesVariant.values ?? []}
          selected={avatarOptions.eyesVariant}
          onSelect={(eyesVariant) => update({ eyesVariant })}
        />
        <VariantPicker
          label="Glasses"
          values={metadata.glassesVariant?.values ?? fallbackMetadata.glassesVariant.values ?? []}
          selected={avatarOptions.glassesVariant}
          onSelect={(glassesVariant) => update({ glassesVariant, glassesProbability: 100 })}
          extraAction={
            <Button size="xs" variant="subtle" color="gray" onClick={() => update({ glassesProbability: 0 })}>
              None
            </Button>
          }
        />
        <VariantPicker
          label="Mouth"
          values={metadata.mouthVariant?.values ?? fallbackMetadata.mouthVariant.values ?? []}
          selected={avatarOptions.mouthVariant}
          onSelect={(mouthVariant) => update({ mouthVariant })}
        />
        <div>
          <Text fw={800} mb="xs">
            Skin color
          </Text>
          <Group gap="xs">
            {avatarSkinColors.map((color) => (
              <Tooltip key={color} label={`#${color}`}>
                <button
                  type="button"
                  className={`avatar-color-swatch ${avatarOptions.backgroundColor === color ? "avatar-color-swatch-active" : ""}`}
                  style={{ backgroundColor: `#${color}` }}
                  aria-label={`Use skin color ${color}`}
                  onClick={() => update({ backgroundColor: color })}
                />
              </Tooltip>
            ))}
          </Group>
        </div>
        <div>
          <Text fw={800} mb="sm">
            Scale
          </Text>
          <Slider
            value={avatarOptions.scale}
            min={0.8}
            max={1.6}
            step={0.05}
            label={(nextValue) => nextValue.toFixed(2)}
            onChange={(scale) => update({ scale })}
          />
        </div>
        <div>
          <Text fw={800} mb="sm">
            Rotation
          </Text>
          <Slider
            value={avatarOptions.rotate}
            min={-20}
            max={20}
            step={1}
            label={(nextValue) => `${nextValue}°`}
            onChange={(rotate) => update({ rotate })}
          />
        </div>
      </Stack>
    </div>
  );
}

type VariantPickerProps = {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
  extraAction?: ReactNode;
};

function VariantPicker({ label, values, selected, onSelect, extraAction }: VariantPickerProps) {
  return (
    <div>
      <Group justify="space-between" mb="xs">
        <Text fw={800}>{label}</Text>
        {extraAction}
      </Group>
      <SimpleGrid cols={{ base: 5, sm: 8, md: 10 }} spacing="xs">
        {values.map((value) => (
          <Button
            key={value}
            variant={selected === value ? "filled" : "light"}
            color={selected === value ? "green" : "gray"}
            size="xs"
            className="avatar-variant-button"
            onClick={() => onSelect(value)}
          >
            {value.replace("variant", "")}
          </Button>
        ))}
      </SimpleGrid>
    </div>
  );
}

function variants(count: number) {
  return Array.from({ length: count }, (_item, index) => `variant${String(index + 1).padStart(2, "0")}`);
}
