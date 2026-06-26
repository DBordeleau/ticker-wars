import { FiChevronDown } from "react-icons/fi";

export default function ScrollCue({ label = "Scroll" }: { label?: string }) {
  return (
    <div className="scroll-cue" aria-hidden>
      <span className="scroll-cue-label">{label}</span>
      <FiChevronDown className="scroll-cue-icon" />
    </div>
  );
}
