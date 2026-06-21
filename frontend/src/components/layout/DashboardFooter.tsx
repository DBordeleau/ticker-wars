import { Anchor, Badge, Group, Skeleton, Text } from "@mantine/core";
import { FaGithub } from "react-icons/fa";
import type { RunMetadata } from "../../api/dashboardData";
import { formatDate, formatDateTime } from "../../utils/format";

type Props = {
  metadata: RunMetadata | null;
  loading: boolean;
};

export default function DashboardFooter({ metadata, loading }: Props) {
  return (
    <footer className="dashboard-footer">
      <div className="footer-credit">
        <Text size="sm">
          Created by{" "}
          <Anchor href="https://www.dillonbordeleau.dev/" target="_blank" rel="noreferrer">
            Dillon Bordeleau
          </Anchor>
        </Text>
      </div>

      <div className="footer-status">
        {loading ? (
          <Skeleton height={44} width={360} radius="sm" />
        ) : (
          <>
            <Group gap="xs" justify="center">
              <Badge color={metadata?.last_pipeline_status === "success" ? "green" : "yellow"}>
                {metadata?.last_pipeline_status ?? "No run"}
              </Badge>
              <Badge variant="outline" color="gray">
                {metadata?.data_source ?? "Data source pending"}
              </Badge>
            </Group>
            <Text size="xs" className="secondary-text" mt={6}>
              Refreshed {formatDateTime(metadata?.generated_at)} | Latest close{" "}
              {formatDate(metadata?.latest_price_date)} | Target {formatDate(metadata?.next_target_date)}
            </Text>
          </>
        )}
      </div>

      <div className="footer-source">
        <Text size="sm">
          View the{" "}
          <Anchor href="https://github.com/DBordeleau/next-day-price" target="_blank" rel="noreferrer">
            source code on Github <FaGithub />
          </Anchor>
        </Text>
      </div>
    </footer>
  );
}
