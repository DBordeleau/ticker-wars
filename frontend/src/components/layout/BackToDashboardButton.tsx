import { Button } from "@mantine/core";
import { FiArrowLeft } from "react-icons/fi";
import { Link } from "react-router-dom";

export default function BackToDashboardButton() {
  return (
    <Button
      component={Link}
      to="/"
      variant="subtle"
      color="gray"
      className="back-dashboard-button"
      leftSection={<FiArrowLeft className="back-dashboard-icon" />}
    >
      Back to dashboard
    </Button>
  );
}
