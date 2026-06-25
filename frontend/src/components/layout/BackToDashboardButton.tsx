import { Button } from "@mantine/core";
import { FiArrowLeft } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";

export default function BackToDashboardButton() {
  const navigate = useNavigate();
  const location = useLocation();
  // location.key === "default" means this is the first history entry (e.g. a
  // deep link or hard refresh onto a ticker/model page); there is no dashboard
  // entry to go back to.
  const canGoBack = location.key !== "default";

  const handleClick = () => {
    if (canGoBack) {
      navigate(-1); // POP -> ScrollManager restores the saved dashboard offset
    } else {
      navigate("/"); // PUSH -> opens dashboard at the top
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
      Back to dashboard
    </Button>
  );
}
