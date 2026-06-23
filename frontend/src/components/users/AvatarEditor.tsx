import { Button, Group, Popover, SimpleGrid, Slider, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { FiEdit3, FiShuffle } from "react-icons/fi";
import { avatarSkinColors, buildDiceBearAvatarUrl, defaultAvatarOptions, normalizeAvatarOptions } from "../../auth/avatar";
import type { AvatarOptions } from "../../auth/types";

type DiceBearOption = {
  type: string;
  values?: string[];
  min?: number;
  max?: number;
};

type DiceBearMetadata = Record<string, DiceBearOption>;

type AvatarFeature = "eyebrows" | "eyes" | "glasses" | "mouth";

type DiceBearSvgAttribute = string | number | boolean | null | undefined;

type DiceBearSvgNode = {
  type?: string;
  name?: string;
  value?: string;
  attributes?: Record<string, DiceBearSvgAttribute>;
  children?: DiceBearSvgNode[];
  elements?: DiceBearSvgNode[];
};

type DiceBearComponentVariant = {
  children?: DiceBearSvgNode[];
  elements?: DiceBearSvgNode[];
};

type DiceBearComponentDefinition = {
  width?: number;
  height?: number;
  variants?: Record<string, DiceBearComponentVariant>;
};

type DiceBearStyleDefinition = {
  components?: Partial<Record<AvatarFeature, DiceBearComponentDefinition>>;
};

type Props = {
  seed: string;
  value: AvatarOptions;
  onChange: (value: AvatarOptions) => void;
};

const metadataUrl = "https://api.dicebear.com/10.x/adventurer-neutral/options.json";
const metadataCacheKey = "dicebear:adventurer-neutral:10.x:options";
const styleDefinitionUrl = "https://cdn.hopjs.net/npm/@dicebear/styles@10.2.0/dist/adventurer-neutral.min.json";
const styleDefinitionCacheKey = "dicebear:adventurer-neutral:10.2.0:definition";

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
  const [styleDefinition, setStyleDefinition] = useState<DiceBearStyleDefinition | null>(null);
  const avatarOptions = normalizeAvatarOptions(value);
  const activeSkinColor = normalizeSkinColor(avatarOptions.backgroundColor);
  const customSkinColor = `#${activeSkinColor}`;
  const isCustomSkinColor = !avatarSkinColors.includes(activeSkinColor);
  const previewUrl = useMemo(
    () => buildDiceBearAvatarUrl(seed, avatarOptions),
    [avatarOptions, seed],
  );

  useEffect(() => {
    let isCurrent = true;

    Promise.all([loadDiceBearMetadata(), loadDiceBearStyleDefinition()])
      .then(([nextMetadata, nextStyleDefinition]) => {
        if (!isCurrent) {
          return;
        }
        setMetadata(nextMetadata);
        setStyleDefinition(nextStyleDefinition);
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setMetadata(fallbackMetadata);
        setStyleDefinition(null);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const update = (patch: Partial<AvatarOptions>) => {
    onChange(normalizeAvatarOptions({ ...avatarOptions, ...patch }));
  };

  const randomizeAvatar = () => {
    const glassesEnabled = Math.random() >= 0.5;

    onChange(
      normalizeAvatarOptions({
        eyebrowsVariant: randomOption(metadata.eyebrowsVariant?.values, fallbackMetadata.eyebrowsVariant.values),
        eyesVariant: randomOption(metadata.eyesVariant?.values, fallbackMetadata.eyesVariant.values),
        glassesVariant: randomOption(metadata.glassesVariant?.values, fallbackMetadata.glassesVariant.values),
        glassesProbability: glassesEnabled ? 100 : 0,
        mouthVariant: randomOption(metadata.mouthVariant?.values, fallbackMetadata.mouthVariant.values),
        backgroundColor: randomOption(avatarSkinColors, avatarSkinColors),
        scale: randomSteppedNumber(0.8, 1.6, 0.05),
        rotate: randomSteppedNumber(-20, 20, 1),
      }),
    );
  };

  return (
    <div className="avatar-editor">
      <div className="avatar-preview-panel">
        <Title order={3} className="avatar-editor-title">
          Preview
        </Title>
        <img src={previewUrl} alt="Avatar preview" className="avatar-preview-image" />
        <Button
          type="button"
          color="green"
          variant="light"
          leftSection={<FiShuffle />}
          className="avatar-randomize-button"
          onClick={randomizeAvatar}
        >
          Randomize
        </Button>
      </div>

      <Stack gap="lg">
        <VariantPicker
          label="Eyebrows"
          feature="eyebrows"
          styleDefinition={styleDefinition}
          values={metadata.eyebrowsVariant?.values ?? fallbackMetadata.eyebrowsVariant.values ?? []}
          selected={avatarOptions.eyebrowsVariant}
          onSelect={(eyebrowsVariant) => update({ eyebrowsVariant })}
        />
        <VariantPicker
          label="Eyes"
          feature="eyes"
          styleDefinition={styleDefinition}
          values={metadata.eyesVariant?.values ?? fallbackMetadata.eyesVariant.values ?? []}
          selected={avatarOptions.eyesVariant}
          onSelect={(eyesVariant) => update({ eyesVariant })}
        />
        <VariantPicker
          label="Glasses"
          feature="glasses"
          styleDefinition={styleDefinition}
          values={metadata.glassesVariant?.values ?? fallbackMetadata.glassesVariant.values ?? []}
          selected={avatarOptions.glassesVariant}
          isSelected={(glassesVariant) =>
            avatarOptions.glassesProbability > 0 && avatarOptions.glassesVariant === glassesVariant
          }
          onSelect={(glassesVariant) => update({ glassesVariant, glassesProbability: 100 })}
          leadingOptions={[
            {
              key: "none",
              label: "None",
              selected: avatarOptions.glassesProbability === 0,
              onSelect: () => update({ glassesProbability: 0 }),
            },
          ]}
        />
        <VariantPicker
          label="Mouth"
          feature="mouth"
          styleDefinition={styleDefinition}
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
                  className={`avatar-color-swatch ${activeSkinColor === color ? "avatar-color-swatch-active" : ""}`}
                  style={{ backgroundColor: `#${color}` }}
                  aria-label={`Use skin color ${color}`}
                  onClick={() => update({ backgroundColor: color })}
                />
              </Tooltip>
            ))}
            <Popover position="bottom-start" withArrow shadow="lg">
              <Popover.Target>
                <button
                  type="button"
                  className={`avatar-color-swatch avatar-color-swatch-custom ${
                    isCustomSkinColor ? "avatar-color-swatch-active" : ""
                  }`}
                  style={{ backgroundColor: customSkinColor }}
                  aria-label="Choose custom skin color"
                >
                  <FiEdit3 />
                </button>
              </Popover.Target>
              <Popover.Dropdown className="avatar-color-popover">
                <label className="avatar-native-color-picker">
                  <span>Custom color</span>
                  <input
                    type="color"
                    value={customSkinColor}
                    aria-label="Custom skin color"
                    onChange={(event) => update({ backgroundColor: normalizeSkinColor(event.currentTarget.value) })}
                  />
                  <span>{customSkinColor}</span>
                </label>
              </Popover.Dropdown>
            </Popover>
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
            label={(nextValue) => `${nextValue} deg`}
            onChange={(rotate) => update({ rotate })}
          />
        </div>
      </Stack>
    </div>
  );
}

type VariantPickerProps = {
  label: string;
  feature: AvatarFeature;
  styleDefinition: DiceBearStyleDefinition | null;
  values: string[];
  selected: string;
  isSelected?: (value: string) => boolean;
  onSelect: (value: string) => void;
  leadingOptions?: VariantPickerLeadingOption[];
};

type VariantPickerLeadingOption = {
  key: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
};

function VariantPicker({
  label,
  feature,
  styleDefinition,
  values,
  selected,
  isSelected,
  onSelect,
  leadingOptions = [],
}: VariantPickerProps) {
  const thumbnailUrls = useMemo(
    () => new Map(values.map((value) => [value, buildVariantThumbnailUrl(styleDefinition, feature, value)])),
    [feature, styleDefinition, values],
  );

  return (
    <div>
      <Group justify="space-between" mb="xs">
        <Text fw={800}>{label}</Text>
      </Group>
      <SimpleGrid cols={{ base: 5, sm: 8, md: 10 }} spacing="xs">
        {leadingOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`avatar-variant-button ${option.selected ? "avatar-variant-button-active" : ""}`}
            aria-pressed={option.selected}
            aria-label={`${label} ${option.label}`}
            title={`${label} ${option.label}`}
            onClick={option.onSelect}
          >
            <span className="avatar-variant-thumbnail-frame avatar-variant-empty-frame">
              <span className="avatar-variant-fallback">{option.label}</span>
            </span>
          </button>
        ))}
        {values.map((value) => {
          const thumbnailUrl = thumbnailUrls.get(value);
          const labelText = `${label} ${value.replace("variant", "")}`;
          const valueSelected = isSelected ? isSelected(value) : selected === value;

          return (
            <button
              key={value}
              type="button"
              className={`avatar-variant-button ${valueSelected ? "avatar-variant-button-active" : ""}`}
              aria-pressed={valueSelected}
              aria-label={labelText}
              title={labelText}
              onClick={() => onSelect(value)}
            >
              <span className="avatar-variant-thumbnail-frame">
                {thumbnailUrl ? (
                  <img src={thumbnailUrl} alt="" loading="lazy" className="avatar-variant-thumbnail" />
                ) : (
                  <span className="avatar-variant-fallback">{value.replace("variant", "")}</span>
                )}
              </span>
            </button>
          );
        })}
      </SimpleGrid>
    </div>
  );
}

async function loadDiceBearMetadata() {
  const cached = readSessionCache<DiceBearMetadata>(metadataCacheKey);
  if (cached) {
    return { ...fallbackMetadata, ...cached };
  }

  const response = await fetch(metadataUrl);
  if (!response.ok) {
    return fallbackMetadata;
  }

  const data = (await response.json()) as DiceBearMetadata;
  writeSessionCache(metadataCacheKey, data);
  return { ...fallbackMetadata, ...data };
}

async function loadDiceBearStyleDefinition() {
  const cached = readSessionCache<DiceBearStyleDefinition>(styleDefinitionCacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(styleDefinitionUrl);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as DiceBearStyleDefinition;
  writeSessionCache(styleDefinitionCacheKey, data);
  return data;
}

function buildVariantThumbnailUrl(
  styleDefinition: DiceBearStyleDefinition | null,
  feature: AvatarFeature,
  variantName: string,
) {
  const component = styleDefinition?.components?.[feature];
  const variant = component?.variants?.[variantName];
  const nodes = variant?.elements ?? variant?.children;

  if (!component || !nodes?.length) {
    return null;
  }

  const width = component.width ?? 320;
  const height = component.height ?? 320;
  const svgBody = nodes.map(svgNodeToString).join("");

  if (!svgBody) {
    return null;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" shape-rendering="auto" aria-hidden="true">${svgBody}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function svgNodeToString(node: DiceBearSvgNode): string {
  if (node.type === "text") {
    return escapeXmlText(node.value ?? "");
  }

  if (!node.name) {
    return "";
  }

  const attributes = node.attributes ? attributesToString(node.attributes) : "";
  const children = node.children ?? node.elements ?? [];
  const body = children.map(svgNodeToString).join("");

  if (!body) {
    return `<${node.name}${attributes} />`;
  }

  return `<${node.name}${attributes}>${body}</${node.name}>`;
}

function attributesToString(attributes: Record<string, DiceBearSvgAttribute>) {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeXmlAttribute(String(value))}"`)
    .join("");
}

function escapeXmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function readSessionCache<T>(key: string) {
  try {
    const cached = sessionStorage.getItem(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache failures should never block avatar editing.
  }
}

function variants(count: number) {
  return Array.from({ length: count }, (_item, index) => `variant${String(index + 1).padStart(2, "0")}`);
}

function randomOption<T>(values: T[] | undefined, fallbackValues: T[] | undefined) {
  const options = values?.length ? values : fallbackValues ?? [];
  return options[Math.floor(Math.random() * options.length)];
}

function randomSteppedNumber(min: number, max: number, step: number) {
  const steps = Math.round((max - min) / step);
  return Number((min + Math.floor(Math.random() * (steps + 1)) * step).toFixed(2));
}

function normalizeSkinColor(color: string) {
  const normalized = color.replace("#", "").trim().toLowerCase();
  return /^[0-9a-f]{6}$/.test(normalized) ? normalized : defaultAvatarOptions.backgroundColor;
}
