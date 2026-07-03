import { Badge, Button, Group, Skeleton, Text } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { FiCheck, FiChevronDown, FiZap } from "react-icons/fi";
import type { EngagementSummary } from "../../api/gamification";
import { useUserEngagementEvents } from "../../hooks/useUserEngagementEvents";
import SectionPanel from "../layout/SectionPanel";
import EngagementEventCard from "./EngagementEventCard";

const MotionPresence = AnimatePresence as unknown as ComponentType<{
  children: ReactNode;
  initial?: boolean;
}>;

export default function SinceLastVisitPanel() {
  const { events, summary, loading, error, markAllSeen, markSeen } = useUserEngagementEvents();
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <SectionPanel className="since-visit-panel" title="Since Your Last Visit">
        <Skeleton height={96} radius="sm" />
      </SectionPanel>
    );
  }

  if (error || events.length === 0) {
    return null;
  }

  const visibleEvents = expanded ? events : events.slice(0, 3);

  return (
    <SectionPanel
      className="since-visit-panel"
      title="Since Your Last Visit"
      subtitle={summarySentence(summary)}
      action={
        <Group gap="xs" wrap="nowrap">
          <Badge variant="light" color="green" className="since-visit-count">
            {events.length} new
          </Badge>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<FiCheck />}
            onClick={() => void markAllSeen()}
          >
            Mark read
          </Button>
        </Group>
      }
    >
      <div className="since-visit-summary-row">
        <span className="since-visit-spark">
          <FiZap aria-hidden />
        </span>
        <Text className="since-visit-summary">{summarySentence(summary)}</Text>
        {events.length > 3 ? (
          <Button
            size="xs"
            variant="subtle"
            color="green"
            rightSection={<FiChevronDown className={expanded ? "since-visit-chevron-open" : ""} />}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Show less" : "Show all"}
          </Button>
        ) : null}
      </div>
      <div className="engagement-event-list">
        <MotionPresence initial={false}>
          {visibleEvents.map((event) => (
            <motion.div
              key={event.event_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <EngagementEventCard event={event} onAction={(nextEvent) => markSeen([nextEvent.event_id])} />
            </motion.div>
          ))}
        </MotionPresence>
      </div>
    </SectionPanel>
  );
}

function summarySentence(summary: EngagementSummary) {
  const parts: string[] = [];
  if (summary.scoredCount > 0) {
    parts.push(`${summary.scoredCount} prediction${summary.scoredCount === 1 ? "" : "s"} scored`);
  }
  if (summary.xpEarned > 0) {
    parts.push(`+${summary.xpEarned.toLocaleString()} XP`);
  }
  if (summary.badgeCount > 0) {
    parts.push(`${summary.badgeCount} badge${summary.badgeCount === 1 ? "" : "s"} unlocked`);
  }
  if (summary.levelUpCount > 0) {
    parts.push(`${summary.levelUpCount} level-up${summary.levelUpCount === 1 ? "" : "s"}`);
  }
  if (summary.maturityCount > 0) {
    parts.push(`${summary.maturityCount} call${summary.maturityCount === 1 ? "" : "s"} nearing maturity`);
  }
  if (summary.lockCount > 0) {
    parts.push(`${summary.lockCount} locked call${summary.lockCount === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(", ") : `${summary.totalCount} new update${summary.totalCount === 1 ? "" : "s"}`;
}
