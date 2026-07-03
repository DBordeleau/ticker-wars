import { Button } from "@mantine/core";
import { FiArrowLeft } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { previousPathname } from "../../utils/navigationHistory";

export default function BackToDashboardButton() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    if (location.pathname === "/rules") {
      navigate("/dashboard");
      return;
    }

    if (previousPathname() === "/dashboard") {
      // The dashboard is the immediately previous history entry: POP back so the
      // ScrollManager restores the dashboard's saved scroll position.
      navigate(-1);
    } else {
      // Came from elsewhere (another ticker/model page) or a deep link: open the
      // dashboard fresh at the top instead of walking back through history.
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
      Back to dashboard
    </Button>
  );
}
