import { Button, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useState } from "react";
import { FiEdit3, FiList, FiLogIn, FiLogOut, FiTarget, FiUser } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { signOut } from "../../auth/authApi";
import { useAuth } from "../../auth/AuthProvider";
import AvatarImage from "./AvatarImage";
import SignInModal from "./SignInModal";

export default function UserControl() {
  const { user, profile, loading, profileLoading } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (!user) {
    return (
      <>
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
        <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
      </>
    );
  }

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="user-control">
      <Tooltip label={profile ? profile.display_username : "Complete profile"}>
        <button
          type="button"
          className="user-avatar-button"
          aria-label="Open user menu"
          aria-expanded={menuOpen}
          disabled={profileLoading}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {profile ? <AvatarImage profile={profile} size={48} /> : <FiUser />}
        </button>
      </Tooltip>
      {menuOpen ? (
        <motion.div
          className="user-radial-menu"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
        >
          <RadialItem icon={<FiTarget />} label="Make prediction" angle={-150} onClick={() => go("/")} />
          <RadialItem icon={<FiList />} label="My predictions" angle={-105} onClick={() => go("/me/predictions")} />
          <RadialItem icon={<FiEdit3 />} label="Edit profile" angle={-60} onClick={() => go("/me/profile")} />
          <RadialItem
            icon={<FiLogOut />}
            label="Log out"
            angle={-15}
            onClick={() => {
              setMenuOpen(false);
              void signOut();
            }}
          />
        </motion.div>
      ) : null}
    </div>
  );
}

type RadialItemProps = {
  icon: ReactNode;
  label: string;
  angle: number;
  onClick: () => void;
};

function RadialItem({ icon, label, angle, onClick }: RadialItemProps) {
  const radius = 96;
  const radians = (angle * Math.PI) / 180;
  const x = Math.cos(radians) * radius;
  const y = Math.sin(radians) * radius;

  return (
    <motion.button
      type="button"
      className="user-radial-item"
      style={{ x, y }}
      initial={{ x: 0, y: 0, opacity: 0 }}
      animate={{ x, y, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      onClick={onClick}
    >
      <span className="user-radial-icon">{icon}</span>
      <span className="user-radial-label">{label}</span>
    </motion.button>
  );
}
