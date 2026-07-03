import type { ReactNode } from "react";
import { FiHelpCircle } from "react-icons/fi";
import { Link } from "react-router-dom";

type Props = {
  section?: string;
  children?: ReactNode;
  compact?: boolean;
  className?: string;
};

export default function RulesLink({
  section,
  children = "Rules",
  compact = false,
  className,
}: Props) {
  const href = section ? `/rules#${section.replace(/^#/, "")}` : "/rules";
  const classes = [
    "rules-link",
    compact ? "rules-link--compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link to={href} className={classes}>
      <FiHelpCircle aria-hidden />
      <span>{children}</span>
    </Link>
  );
}
