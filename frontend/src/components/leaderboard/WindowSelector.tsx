import { Menu, Text, UnstyledButton } from "@mantine/core";
import { motion } from "framer-motion";
import { FiCheck, FiChevronDown, FiClock } from "react-icons/fi";
import { FaClock } from "react-icons/fa";
import type { MetricWindow } from "../../api/dashboardData";

type Props = {
  value: MetricWindow;
  onChange: (window: MetricWindow) => void;
  className?: string;
};

type WindowOption = {
  label: string;
  value: MetricWindow;
};

const options: WindowOption[] = [
  { label: "last week", value: "7d" },
  { label: "last month", value: "30d" },
  { label: "last 3 months", value: "90d" },
  { label: "all-time", value: "all" },
];

function getCurrentLabel(value: MetricWindow) {
  return options.find((option) => option.value === value)?.label ?? "selected window";
}

function getSentencePrefix(value: MetricWindow) {
  return value === "all" ? "Showing" : "Showing results for the";
}

export default function WindowSelector({ value, onChange, className }: Props) {
  const currentLabel = getCurrentLabel(value);
  const sentencePrefix = getSentencePrefix(value);

  return (
    <div className={className ? `window-sentence ${className}` : "window-sentence"}>
      <Text component="span" className="window-copy">
        {sentencePrefix}
      </Text>
      <Menu
        shadow="xl"
        width={260}
        position="bottom"
        offset={10}
        transitionProps={{ transition: "pop-top-left", duration: 180 }}
      >
        <Menu.Target>
          <UnstyledButton className="window-trigger">
            <span className="window-trigger-icon" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <FaClock size="1.25rem" />
            </span>
            <span className="window-trigger-label">
              <motion.span
                key={value}
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
              >
                {currentLabel}
              </motion.span>
            </span>
            <FiChevronDown className="window-chevron" />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown className="window-menu">
          <Menu.Label>Performance window</Menu.Label>
          {options.map((option) => (
            <Menu.Item
              key={option.label}
              leftSection={option.value === value ? <FiCheck /> : null}
              onClick={() => {
                onChange(option.value);
              }}
            >
              {option.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
