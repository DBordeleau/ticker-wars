import { Drawer } from "@mantine/core";
import { motion, useDragControls, type PanInfo } from "framer-motion";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { FiX } from "react-icons/fi";

type Props = {
  opened: boolean;
  onClose: () => void;
  children: ReactNode;
  drawerClassName?: string;
  panelClassName?: string;
  showClose?: boolean;
  "aria-label"?: string;
};

// A bottom-sheet Drawer that can be dismissed three ways: tapping the overlay,
// the optional close button, or dragging the grab handle down. The sheet is
// content-height, so the overlay above it always stays tappable.
export default function SwipeSheet({
  opened,
  onClose,
  children,
  drawerClassName,
  panelClassName,
  showClose = false,
  "aria-label": ariaLabel,
}: Props) {
  const dragControls = useDragControls();

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 700) {
      onClose();
    }
  };

  const startDrag = (event: ReactPointerEvent) => {
    dragControls.start(event);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      padding={0}
      withCloseButton={false}
      className={`swipe-sheet-drawer ${drawerClassName ?? ""}`}
      overlayProps={{ backgroundOpacity: 0.5, blur: 8 }}
    >
      <motion.div
        className={`swipe-sheet ${panelClassName ?? ""}`}
        aria-label={ariaLabel}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.55 }}
        onDragEnd={handleDragEnd}
      >
        <button
          type="button"
          className="swipe-sheet-grab"
          aria-label="Drag down to close"
          onPointerDown={startDrag}
        >
          <span className="swipe-sheet-grabber" aria-hidden />
        </button>
        {showClose ? (
          <button type="button" className="swipe-sheet-close" aria-label="Close" onClick={onClose}>
            <FiX />
          </button>
        ) : null}
        {children}
      </motion.div>
    </Drawer>
  );
}
