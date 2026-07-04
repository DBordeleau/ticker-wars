import { motion } from "framer-motion";
import { FiArrowLeft } from "react-icons/fi";

type Props = {
  onBack: () => void;
};

const LEAD = "We only store what we need:";
const STORED_ITEMS = [
  "your username",
  "your avatar",
  "the predictions you make",
  "the basic account details associated with your sign-in provider (Google, Discord, or GitHub)",
];
const PARAGRAPHS = [
  "If you mark your profile as Private, your predictions won't be shown to other users or shared anywhere.",
  "You can delete your account from your profile page. Account deletion removes your profile, predictions, scoring history, progression, badges, public profile projections, and sign-in account.",
  "We don't sell your data, and we don't build advertising profiles.",
];
const FOOTER =
  "That's it. No novels or legal jargon. If we ever start collecting anything new, we'll update this page.";

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 200, damping: 22, mass: 0.7 },
  },
};

export default function PrivacyPolicy({ onBack }: Props) {
  return (
    <div className="privacy-policy">
      <button type="button" className="privacy-back" onClick={onBack}>
        <FiArrowLeft aria-hidden />
        Back to sign in
      </button>

      <motion.div className="privacy-body" variants={container} initial="hidden" animate="visible">
        <motion.h1 variants={item} className="privacy-title" style={{ fontSize: "2rem", color: "#51ff85" }}>
          Privacy Policy
        </motion.h1>
        <motion.p variants={item} className="privacy-lead">
          {LEAD}
        </motion.p>
        <motion.ul variants={item} className="privacy-list">
          {STORED_ITEMS.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </motion.ul>
        {PARAGRAPHS.map((paragraph) => (
          <motion.p variants={item} className="privacy-text" key={paragraph} style={{ color: "#fff" }}>
            {paragraph}
          </motion.p>
        ))}
        <motion.p variants={item} className="privacy-text privacy-emphasis">
          {FOOTER}
        </motion.p>
      </motion.div>
    </div>
  );
}
