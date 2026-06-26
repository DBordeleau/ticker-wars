import { motion } from "framer-motion";
import type { ReactNode } from "react";
import ScrollCue from "./ScrollCue";

type Props = {
  children: ReactNode;
  className?: string;
  id?: string;
  // FAQ + footer section: auto height instead of forced 100vh.
  auto?: boolean;
  // Render a "keep scrolling" cue pinned to the bottom of the section.
  cue?: boolean;
};

export default function SectionShell({ children, className = "", id, auto = false, cue = false }: Props) {
  return (
    <section
      id={id}
      className={`landing-section ${auto ? "landing-section--auto" : ""} ${className}`.trim()}
    >
      <motion.div
        className="landing-section-inner"
        initial={{ opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.35 }}
        transition={{ type: "spring", stiffness: 120, damping: 20, mass: 0.7 }}
      >
        {children}
      </motion.div>
      {cue ? <ScrollCue /> : null}
    </section>
  );
}
