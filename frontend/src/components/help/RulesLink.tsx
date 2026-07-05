import { Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import { IoIosHelpCircle } from "react-icons/io";
import { Link } from "react-router-dom";

type Props = {
  section?: string;
  children?: ReactNode;
  compact?: boolean;
  iconOnly?: boolean;
  tooltipLabel?: string;
  className?: string;
};

export default function RulesLink({
  section,
  children = "Rules",
  compact = false,
  iconOnly = false,
  tooltipLabel,
  className,
}: Props) {
  const href = section ? `/rules#${section.replace(/^#/, "")}` : "/rules";
  const classes = [
    "rules-link",
    compact ? "rules-link--compact" : "",
    iconOnly ? "rules-link--icon" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const accessibleLabel =
    iconOnly && typeof tooltipLabel === "string"
      ? tooltipLabel
      : iconOnly && typeof children === "string"
        ? children
        : undefined;

  const link = (
    <Link to={href} className={classes} aria-label={accessibleLabel}>
      <IoIosHelpCircle aria-hidden />
      {iconOnly ? (
        <span className="rules-link-icon-label">{children}</span>
      ) : (
        <span>{children}</span>
      )}
    </Link>
  );

  if (!iconOnly) {
    return link;
  }

  return (
    <Tooltip label={tooltipLabel ?? children} openDelay={250}>
      {link}
    </Tooltip>
  );
}
