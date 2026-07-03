import { Group, Text } from "@mantine/core";
import { FiAward, FiTarget } from "react-icons/fi";
import { Link } from "react-router-dom";
import type { TickerSpecialtyRow } from "../../api/competition";
import { isScoreVerdict, VERDICT_LABELS } from "../../api/gamification";
import { formatPercent } from "../../utils/format";
import EntityHoverCard from "../cards/EntityHoverCard";
import AvatarImage from "../users/AvatarImage";

type Props = {
  specialty: TickerSpecialtyRow;
  mode: "user" | "ticker";
};

export default function TickerSpecialtyCard({ specialty, mode }: Props) {
  const verdictLabel = isScoreVerdict(specialty.best_score_verdict)
    ? VERDICT_LABELS[specialty.best_score_verdict]
    : "No verdict";
  const pctError =
    specialty.average_absolute_pct_error == null
      ? "-"
      : formatPercent(specialty.average_absolute_pct_error);

  return (
    <div className="ticker-specialty-card">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        {mode === "ticker" ? (
          <EntityHoverCard kind="user" username={specialty.username}>
            <Link to={`/users/${specialty.username}`} className="ticker-specialty-identity plain-link">
              <AvatarImage
                profile={{
                  display_username: specialty.username,
                  avatar_seed: specialty.avatar_seed,
                  avatar_options: specialty.avatar_options,
                }}
                size={36}
              />
              <span>
                <span className="ticker-specialty-eyebrow">Specialist #{specialty.ticker_rank ?? "?"}</span>
                <span className="ticker-specialty-title">{specialty.username}</span>
              </span>
            </Link>
          </EntityHoverCard>
        ) : (
          <Link to={`/tickers/${specialty.ticker}`} className="ticker-specialty-identity plain-link">
            <span className="ticker-specialty-symbol">{specialty.ticker}</span>
            <span>
              <span className="ticker-specialty-eyebrow">Specialty rank #{specialty.ticker_rank ?? "?"}</span>
              <span className="ticker-specialty-title">{specialty.ticker}</span>
            </span>
          </Link>
        )}
        <span className="ticker-specialty-medal" aria-hidden>
          <FiAward />
        </span>
      </Group>

      <div className="ticker-specialty-stats">
        <span>
          <strong>{specialty.scored_count.toLocaleString()}</strong>
          <Text span>Scored</Text>
        </span>
        <span>
          <strong>{formatPercent(specialty.directional_accuracy)}</strong>
          <Text span>Directional</Text>
        </span>
        <span>
          <strong>{pctError}</strong>
          <Text span>Avg error</Text>
        </span>
      </div>

      <div className="ticker-specialty-footer">
        <span>
          <FiTarget aria-hidden /> Best: {verdictLabel}
        </span>
        <span>{specialty.close_call_or_better_count.toLocaleString()} close+</span>
      </div>
    </div>
  );
}
