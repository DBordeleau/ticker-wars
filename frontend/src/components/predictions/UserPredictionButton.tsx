import { Button, Drawer, Modal, Popover } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiEdit3 } from "react-icons/fi";
import { TbTargetArrow } from "react-icons/tb";
import type { LatestPrediction } from "../../api/dashboardData";
import type { UserPrediction } from "../../api/userPredictions";
import { useAuth } from "../../auth/AuthProvider";
import MagicHoverSurface from "../layout/MagicHoverSurface";
import SignInModal from "../users/SignInModal";
import UserPredictionForm from "./UserPredictionForm";

type Props = {
  ticker: string;
  latestPredictions: LatestPrediction[];
  existingPrediction?: UserPrediction | null;
  compact?: boolean;
  onSaved?: (prediction: UserPrediction) => void;
};

// Only one prediction popover/modal may be open at a time across the page.
// Opening a new one closes whichever was previously open (module-level so every
// UserPredictionButton instance shares it).
let activePredictionClose: (() => void) | null = null;

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
  // Gates the popover's top/left transition: enabled a beat after open so the
  // initial placement does not slide in from the corner.
  const [repositionReady, setRepositionReady] = useState(false);
  const isMobile = useMediaQuery("(max-width: 760px)");
  const navigate = useNavigate();

  // Enforce single-open across instances, and arm the reposition easing.
  useEffect(() => {
    if (!opened) {
      setRepositionReady(false);
      return;
    }
    if (activePredictionClose && activePredictionClose !== handlers.close) {
      activePredictionClose();
    }
    activePredictionClose = handlers.close;
    const armId = window.setTimeout(() => setRepositionReady(true), 220);
    return () => {
      window.clearTimeout(armId);
      if (activePredictionClose === handlers.close) {
        activePredictionClose = null;
      }
    };
  }, [opened, handlers.close]);

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

  // Only the desktop popover is click-outside dismissable; there the horizon
  // Select must render in-place so choosing an option is not seen as an outside
  // click. The modal and mobile drawer keep the portaled dropdown.
  const horizonWithinPortal = Boolean(isMobile) || !compact;
  const form = (
    <UserPredictionForm
      ticker={ticker}
      latestPredictions={latestPredictions}
      existingPrediction={existingPrediction}
      comboboxWithinPortal={horizonWithinPortal}
      onSaved={(prediction) => {
        handlers.close();
        onSaved?.(prediction);
      }}
      onCancel={handlers.close}
    />
  );
  // Desktop popover/modal share a glass card that reacts to the cursor spotlight
  // (the Mantine chrome is reset to transparent; this owns the border ring).
  const spotlightForm = (
    <MagicHoverSurface className="prediction-magic-surface">
      <div className="prediction-surface-card">{form}</div>
    </MagicHoverSurface>
  );
  const controlClassName = `spotlight-control-wrap predict-control-wrap${compact ? " predict-control-compact" : ""}`;
  const buttonClassName = "spotlight-control-button predict-control-button";
  const buttonLabel = existingPrediction ? "Edit" : "Predict";
  const ButtonIcon = existingPrediction ? FiEdit3 : TbTargetArrow;
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
              leftSection={<ButtonIcon />}
              onClick={handleOpen}
            >
              {buttonLabel}
            </Button>
          </motion.div>
          <Drawer
            opened={opened}
            onClose={handlers.close}
            title={`${ticker} prediction`}
            position="bottom"
            className="prediction-drawer"
          >
            {form}
          </Drawer>
        </>
      ) : compact ? (
        <Popover
          opened={opened}
          onChange={(nextOpened) => (nextOpened ? handlers.open() : handlers.close())}
          position="bottom-end"
          shadow="none"
          trapFocus
          closeOnEscape
          closeOnClickOutside
          withinPortal
          transitionProps={{ transition: "pop", duration: 190 }}
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
                leftSection={<ButtonIcon />}
                onClick={handleOpen}
              >
                {buttonLabel}
              </Button>
            </motion.div>
          </Popover.Target>
          <Popover.Dropdown
            className={`prediction-pop-dropdown${repositionReady ? " prediction-pop-dropdown--anchored" : ""}`}
          >
            {spotlightForm}
          </Popover.Dropdown>
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
              leftSection={<ButtonIcon />}
              onClick={handleOpen}
            >
              {buttonLabel}
            </Button>
          </motion.div>
          <Modal
            opened={opened}
            onClose={handlers.close}
            centered
            withCloseButton={false}
            padding={0}
            className="prediction-modal"
            overlayProps={{ backgroundOpacity: 0.48, blur: 8 }}
            transitionProps={{ transition: "pop", duration: 190 }}
          >
            {spotlightForm}
          </Modal>
        </>
      )}
      <SignInModal opened={signInOpen} onClose={signInHandlers.close} />
    </>
  );
}
