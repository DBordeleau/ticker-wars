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
  const [loading, setLoading] = useState(false);
  const avatarOptions = normalizeAvatarOptions(value);
  const previewUrl = useMemo(
    () => buildDiceBearAvatarUrl(seed, avatarOptions),
    [avatarOptions, seed],
  );

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);

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
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
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
          onSelect={(glassesVariant) => update({ glassesVariant, glassesProbability: 100 })}
          extraAction={
            <Button size="xs" variant="subtle" color="gray" onClick={() => update({ glassesProbability: 0 })}>
              None
            </Button>
          }
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
  onSelect: (value: string) => void;
  extraAction?: ReactNode;
};

function VariantPicker({ label, feature, styleDefinition, values, selected, onSelect, extraAction }: VariantPickerProps) {
  const thumbnailUrls = useMemo(
    () => new Map(values.map((value) => [value, buildVariantThumbnailUrl(styleDefinition, feature, value)])),
    [feature, styleDefinition, values],
  );

  return (
    <div>
      <Group justify="space-between" mb="xs">
        <Text fw={800}>{label}</Text>
        {extraAction}
      </Group>
      <SimpleGrid cols={{ base: 5, sm: 8, md: 10 }} spacing="xs">
        {values.map((value) => {
          const thumbnailUrl = thumbnailUrls.get(value);
          const labelText = `${label} ${value.replace("variant", "")}`;

          return (
            <button
              key={value}
              type="button"
              className={`avatar-variant-button ${selected === value ? "avatar-variant-button-active" : ""}`}
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
