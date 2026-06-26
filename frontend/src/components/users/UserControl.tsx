import { Button, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { AnimatePresence as FramerAnimatePresence, motion, useScroll, useSpring, useTransform } from "framer-motion";
import type { ReactNode } from "react";
import { useState } from "react";
import { FiEdit3, FiList, FiLogIn, FiLogOut, FiTarget, FiUser } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { signOut } from "../../auth/authApi";
import { useAuth } from "../../auth/AuthProvider";
import AvatarImage from "./AvatarImage";
import SignInModal from "./SignInModal";

const AnimatePresence = FramerAnimatePresence as unknown as (props: { children: ReactNode }) => JSX.Element;

export default function UserControl() {
  const { user, profile, loading, profileLoading } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const compactMenu = useMediaQuery("(max-width: 520px)") ?? false;
  const { scrollY } = useScroll();
  const driftSource = useSpring(scrollY, { stiffness: 42, damping: 24, mass: 0.7 });
  const driftX = useTransform(driftSource, (value) => Math.sin(value / 220) * 7);
  const driftY = useTransform(driftSource, (value) => Math.cos(value / 180) * 8);

  if (!user) {
    return (
      <div className="user-control">
        <motion.div className="user-control-drift" style={{ x: driftX, y: driftY }}>
          <div className="user-control-float">
            <Button
              className="user-sign-in-button"
              variant="outline"
              color="green"
              leftSection={<FiLogIn />}
              loading={loading}
              onClick={() => setSignInOpen(true)}
            >
              Sign in
            </Button>
          </div>
        </motion.div>
        <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
      </div>
    );
  }

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="user-control">
      <motion.div className="user-control-drift" style={{ x: driftX, y: driftY }}>
        <div className="user-control-float">
          <Tooltip label={profile ? profile.display_username : "Complete profile"}>
            <button
              type="button"
              className="user-avatar-button"
              aria-label="Open user menu"
              aria-expanded={menuOpen}
              disabled={profileLoading}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <span className="user-avatar-frame">
                {profile ? (
                  <AvatarImage profile={profile} size={60} className="user-avatar-portrait" />
                ) : (
                  <FiUser className="user-avatar-placeholder" />
                )}
              </span>
            </button>
          </Tooltip>
        </div>
      </motion.div>
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="user-radial-menu"
            initial="closed"
            animate="open"
            exit="closed"
            variants={{
              open: {
                opacity: 1,
                scale: 1,
                transition: { staggerChildren: 0.045, delayChildren: 0.03 },
              },
              closed: {
                opacity: 0,
                scale: 0.92,
                transition: { staggerChildren: 0.035, staggerDirection: -1, when: "afterChildren" },
              },
            }}
          >
            <RadialItem
              icon={<FiLogOut />}
              label="Log out"
              x={compactMenu ? 0 : -180}
              y={compactMenu ? -58 : -12}
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
            />
            <RadialItem
              icon={<FiEdit3 />}
              label="Edit profile"
              x={compactMenu ? 0 : -160}
              y={compactMenu ? -116 : -86}
              onClick={() => go("/me/profile")}
            />
            <RadialItem
              icon={<FiList />}
              label="My predictions"
              x={compactMenu ? 0 : -116}
              y={compactMenu ? -174 : -154}
              onClick={() => go("/me/predictions")}
            />
            <RadialItem
              icon={<FiTarget />}
              label="Make prediction"
              x={compactMenu ? 0 : -36}
              y={compactMenu ? -232 : -205}
              onClick={() => go("/")}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type RadialItemProps = {
  icon: ReactNode;
  label: string;
  x: number;
  y: number;
  onClick: () => void;
};

function RadialItem({ icon, label, x, y, onClick }: RadialItemProps) {
  return (
    <motion.button
      type="button"
      className="user-radial-item"
      variants={{
        open: { x, y, opacity: 1, scale: 1 },
        closed: { x: 0, y: 0, opacity: 0, scale: 0.86 },
      }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      onClick={onClick}
    >
      <span className="user-radial-icon">{icon}</span>
      <span className="user-radial-label">{label}</span>
    </motion.button>
  );
}
