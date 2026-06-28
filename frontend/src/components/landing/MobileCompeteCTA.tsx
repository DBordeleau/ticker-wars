import { useEffect, useState } from "react";
import CompeteCtaButton from "./CompeteCtaButton";

type Props = {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onClick: () => void;
};

export default function MobileCompeteCTA({ scrollerRef, onClick }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;

    const onScroll = () => {
      const vh = window.innerHeight || 1;
      const pastHero = el.scrollTop > vh * 0.6;
      // Tuck away near the very bottom so the FAB never covers the footer
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 140;
      setVisible(pastHero && !nearBottom);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollerRef]);

  return (
    <div className={`mobile-compete-cta ${visible ? "is-visible" : ""}`.trim()}>
      <CompeteCtaButton onClick={onClick} label="Start competing" />
    </div>
  );
}
