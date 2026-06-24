import { Button, Drawer, Modal, Popover } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { motion } from "framer-motion";
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
  const controlClassName = `spotlight-control-wrap predict-control-wrap${compact ? " predict-control-compact" : ""}`;
  const buttonClassName = "spotlight-control-button predict-control-button";
  const buttonLabel = existingPrediction ? "Edit" : "Predict";
  const pressMotion = {
    scale: 0.965,
    y: 1,
  };
  const hoverMotion = {
    scale: 1.018,
    y: -1,
  };
  const pressTransition = {
    type: "spring" as const,
    stiffness: 520,
    damping: 19,
    mass: 0.42,
  };

  return (
    <>
      {isMobile ? (
        <>
          <motion.div
            className={controlClassName}
            whileHover={hoverMotion}
            whileTap={pressMotion}
            transition={pressTransition}
          >
            <Button
              className={buttonClassName}
              color="green"
              variant="subtle"
              leftSection={<FiTarget />}
              onClick={handleOpen}
            >
              {buttonLabel}
            </Button>
          </motion.div>
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
            <motion.div
              className={controlClassName}
              whileHover={hoverMotion}
              whileTap={pressMotion}
              transition={pressTransition}
            >
              <Button
                className={buttonClassName}
                color="green"
                variant="subtle"
                leftSection={<FiTarget />}
                onClick={handleOpen}
              >
                {buttonLabel}
              </Button>
            </motion.div>
          </Popover.Target>
          <Popover.Dropdown className="user-prediction-popover">{form}</Popover.Dropdown>
        </Popover>
      ) : (
        <>
          <motion.div
            className={controlClassName}
            whileHover={hoverMotion}
            whileTap={pressMotion}
            transition={pressTransition}
          >
            <Button
              className={buttonClassName}
              color="green"
              variant="subtle"
              leftSection={<FiTarget />}
              onClick={handleOpen}
            >
              {buttonLabel}
            </Button>
          </motion.div>
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
