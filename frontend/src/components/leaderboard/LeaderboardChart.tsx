import { Skeleton, Text } from "@mantine/core";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  LeaderboardRow,
  MetricHorizon,
  MetricWindow,
  UserLeaderboardRow,
} from "../../api/dashboardData";
import type { DashboardView } from "../dashboard/DashboardViewToggle";
import SectionPanel from "../layout/SectionPanel";

type Props = {
  rows: LeaderboardRow[];
  userRows: UserLeaderboardRow[];
  view: DashboardView;
  window: MetricWindow;
  horizon: MetricHorizon;
  loading: boolean;
};

type DisplayLeaderboardRow = LeaderboardRow | UserLeaderboardRow;

export default function LeaderboardChart({
  rows,
  userRows,
  view,
  window,
  horizon,
  loading,
}: Props) {
  const sourceRows: DisplayLeaderboardRow[] = view === "models" ? rows : userRows;
  const data = sourceRows
    .filter(
      (row) => row.window === window && row.prediction_horizon === horizon && row.mae != null,
    )
    .sort((a, b) => (a.mae ?? 0) - (b.mae ?? 0))
    .map((row) => ({
      name: "model_name" in row ? row.model_name : row.username,
      mae: row.mae,
    }));

  return (
    <SectionPanel
      title="Error Snapshot"
      subtitle={`Lower MAE is better for the selected ${view === "models" ? "model" : "user"} view.`}
    >
      {loading ? (
        <Skeleton height={260} radius="sm" />
      ) : data.length === 0 ? (
        <Text c="dimmed" size="sm">
          Error bars will appear once scored predictions are available.
        </Text>
      ) : (
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ left: 12, right: 16 }}>
              <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="#b8c6bf" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={112}
                stroke="#b8c6bf"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(74, 222, 128, 0.08)" }}
                contentStyle={{
                  background: "#0d0f10",
                  border: "1px solid rgba(74, 222, 128, 0.18)",
                  borderRadius: 6,
                }}
              />
              <Bar dataKey="mae" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionPanel>
  );
}
