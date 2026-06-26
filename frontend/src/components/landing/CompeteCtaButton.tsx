import { forwardRef } from "react";
import { FiZap } from "react-icons/fi";

type Props = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
};

const CompeteCtaButton = forwardRef<HTMLButtonElement, Props>(function CompeteCtaButton(
  { onClick, disabled, className = "", label = "Start competing" },
  ref,
) {
  return (
    <button
      type="button"
      ref={ref}
      className={`hero-competition-cta ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="hero-competition-cta-surface">
        <FiZap aria-hidden />
        <span>{label}</span>
      </span>
    </button>
  );
});

export default CompeteCtaButton;
