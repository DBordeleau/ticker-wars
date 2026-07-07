import { Button } from "@mantine/core";
import { FiArrowLeft } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { hasPreviousBrowserEntry } from "../../utils/navigationHistory";

export default function BackToDashboardButton() {
  const navigate = useNavigate();

  const handleClick = () => {
    if (hasPreviousBrowserEntry()) {
      // POP back so ScrollManager restores the saved scroll position for the
      // previous history entry.
      navigate(-1);
    } else {
      // Deep link / hard refresh: keep a useful in-app escape hatch.
      navigate("/dashboard");
    }
  };

  return (
    <Button
      onClick={handleClick}
      variant="subtle"
      color="gray"
      className="back-dashboard-button"
      leftSection={<FiArrowLeft className="back-dashboard-icon" />}
    >
      Back
    </Button>
  );
}
