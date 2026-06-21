import { Card, Group, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function SectionPanel({ title, subtitle, action, children, className }: Props) {
  return (
    <Card className={className ? `section-panel ${className}` : "section-panel"}>
      <Group justify="space-between" align="flex-start" gap="md" mb="md">
        <div>
          <Title order={2} className="section-title">
            {title}
          </Title>
          {subtitle ? (
            <Text c="dimmed" size="sm" mt={4}>
              {subtitle}
            </Text>
          ) : null}
        </div>
        {action}
      </Group>
      {children}
    </Card>
  );
}
