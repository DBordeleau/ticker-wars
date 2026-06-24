import { Button, Drawer, Modal, Popover } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import { FiTarget } from "react-icons/fi";
import type { LatestPrediction } from "../../api/dashboardData";
import type { UserPrediction } from "../../api/userPredictions";
import { useAuth } from "../../auth/AuthProvider";
import SignInModal from "../users/SignInModal";
import UserPredictionForm from "./UserPredictionForm";

type Props = {
  ticker: string;
  latestPredictions: LatestPrediction[];
  existingPrediction?: UserPrediction | null;
  compact?: boolean;
  onSaved?: (prediction: UserPrediction) => void;
};

export default function UserPredictionButton({
  ticker,
  latestPredictions,
  existingPrediction,
  compact = false,
  onSaved,
}: Props) {
  const { user, profile } = useAuth();
  const [opened, handlers] = useDisclosure(false);
  const [signInOpen, signInHandlers] = useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 760px)");
  const navigate = useNavigate();

  const handleOpen = () => {
    if (!user) {
      signInHandlers.open();
      return;
    }
    if (!profile) {
      navigate("/onboarding");
      return;
    }
    handlers.open();
  };

  const form = (
    <UserPredictionForm
      ticker={ticker}
      latestPredictions={latestPredictions}
      existingPrediction={existingPrediction}
      onSaved={(prediction) => {
        handlers.close();
        onSaved?.(prediction);
      }}
      onCancel={handlers.close}
    />
  );

  return (
    <>
      {isMobile ? (
        <>
          <Button
            color="green"
            variant={compact ? "subtle" : "filled"}
            leftSection={<FiTarget />}
            onClick={handleOpen}
          >
            {existingPrediction ? "Edit" : compact ? "Predict" : "Predict"}
          </Button>
          <Drawer opened={opened} onClose={handlers.close} title={`${ticker} prediction`} position="bottom">
            {form}
          </Drawer>
        </>
      ) : compact ? (
        <Popover
          opened={opened}
          onChange={(nextOpened) => (nextOpened ? handlers.open() : handlers.close())}
          position="bottom-end"
          withArrow
          shadow="xl"
          trapFocus
          closeOnEscape
          closeOnClickOutside={false}
          withinPortal
        >
          <Popover.Target>
            <Button
              color="green"
              variant={compact ? "subtle" : "filled"}
              leftSection={<FiTarget />}
              onClick={handleOpen}
            >
              {existingPrediction ? "Edit" : compact ? "Predict" : "Predict"}
            </Button>
          </Popover.Target>
          <Popover.Dropdown className="user-prediction-popover">{form}</Popover.Dropdown>
        </Popover>
      ) : (
        <>
          <Button color="green" variant="filled" leftSection={<FiTarget />} onClick={handleOpen}>
            {existingPrediction ? "Edit" : "Predict"}
          </Button>
          <Modal
            opened={opened}
            onClose={handlers.close}
            title={`${ticker} prediction`}
            centered
            className="prediction-modal"
            overlayProps={{ backgroundOpacity: 0.48, blur: 8 }}
          >
            {form}
          </Modal>
        </>
      )}
      <SignInModal opened={signInOpen} onClose={signInHandlers.close} />
    </>
  );
}
