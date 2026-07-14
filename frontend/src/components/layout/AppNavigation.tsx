import { Popover, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { forwardRef, useCallback, useMemo, useState } from "react";
import {
  FiEdit3,
  FiLogIn,
  FiLogOut,
  FiSearch,
  FiTrendingUp,
  FiUser,
} from "react-icons/fi";
import {
  FaHome,
  FaListUl
} from "react-icons/fa";
import { RiStockFill } from "react-icons/ri";
import { IoIosHelpCircle } from "react-icons/io";
import { TbTargetArrow } from "react-icons/tb";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { levelProgress, titleForLevel } from "../../api/gamification";
import { signOut } from "../../auth/authApi";
import { useAuth } from "../../auth/AuthProvider";
import { useUserProgression } from "../../hooks/useUserProgression";
import QuickPredictModal from "../predictions/QuickPredictModal";
import SignInModal from "../users/SignInModal";
import SiteSearch from "../search/SiteSearch";
import AvatarImage from "../users/AvatarImage";
import MagicHoverSurface from "./MagicHoverSurface";
import SwipeSheet from "./SwipeSheet";

type NavItem = {
  label: string;
  to: string;
  icon: ReactNode;
  end?: boolean;
  className?: string;
  action?: "predict" | "account";
};

// Dashboard is intentionally not a link here — the brand mark is the home
// affordance, so a separate Dashboard pill would be redundant.
const signedInDesktopItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: <FaHome />, end: true },
  { label: "Tickers", to: "/tickers", icon: <RiStockFill /> },
  { label: "My Predictions", to: "/me/predictions", icon: <FaListUl /> },
  { label: "Rules", to: "/rules", icon: <IoIosHelpCircle /> },
];

const publicItems: NavItem[] = [
  { label: "Tickers", to: "/tickers", icon: <FaHome /> },
  { label: "Rules", to: "/rules", icon: <IoIosHelpCircle /> },
];

// On mobile the account avatar lives in the bottom bar (thumb-reachable). Rules
// moves into the account panel to keep this to five slots with Predict centered.
const mobileItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: <FaHome />, end: true },
  { label: "Tickers", to: "/tickers", icon: <RiStockFill />, end: false },
  { label: "Predict", to: "/tickers", icon: <TbTargetArrow />, action: "predict", className: "mobile-app-nav-item--predict" },
  { label: "My Predictions", to: "/me/predictions", icon: <FaListUl /> },
  { label: "Account", to: "", icon: <FiUser />, action: "account" },
];

export default function AppNavigation() {
  const { user, profile, profileLoading } = useAuth();
  const progressionState = useUserProgression();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 820px)") ?? false;
  const [accountOpen, setAccountOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [predictOpen, setPredictOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const hideNav = location.pathname === "/auth/callback" || (!user && location.pathname === "/");
  const progression = progressionState.progression;
  const xpProgress = levelProgress(progression?.total_xp ?? 0);
  const displayedLevel = progression?.level ?? xpProgress.level;
  const profilePath = profile ? `/users/${profile.username}` : "/onboarding";
  const ringStyle = {
    "--xp-progress": `${Math.round(xpProgress.progress * 360)}deg`,
  } as CSSProperties;

  const accountLabel = profile
    ? `Open account options for ${profile.display_username}`
    : "Open account options";

  const navItems = user ? signedInDesktopItems : publicItems;
  const brandTarget = user ? "/dashboard" : "/";

  const accountPanel = useMemo(
    () => (
      <AccountPanel
        displayedLevel={displayedLevel}
        profilePath={profilePath}
        title={titleForLevel(displayedLevel)}
        username={profile?.display_username ?? "Complete profile"}
        xpProgress={xpProgress.progress}
        xpToNext={xpProgress.xpToNext}
        nextLevel={xpProgress.nextLevel}
        mobile={isMobile}
        onNavigate={(path) => {
          setAccountOpen(false);
          navigate(path);
        }}
        onSignOut={() => {
          setAccountOpen(false);
          void signOut();
        }}
      />
    ),
    [displayedLevel, isMobile, navigate, profile?.display_username, profilePath, xpProgress.nextLevel, xpProgress.progress, xpProgress.xpToNext],
  );

  if (hideNav) {
    return (
      <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
    );
  }

  return (
    <>
      <motion.div
        className="app-nav-frame app-nav-frame--desktop"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <MagicHoverSurface as="nav" aria-label="Primary" className="app-nav app-nav--desktop">
          <BrandLink to={brandTarget} />
          <span className="app-nav-divider" aria-hidden />
          <div className="app-nav-links">
            {navItems.map((item) => (
              <AppNavLink key={item.to} item={item} />
            ))}
          </div>
          <SiteSearch />
          <div className="app-nav-right">
            {user ? (
              <button type="button" className="app-nav-predict" onClick={() => setPredictOpen(true)}>
                <TbTargetArrow />
                <span>Predict</span>
              </button>
            ) : (
              <button type="button" className="app-nav-predict" onClick={() => setSignInOpen(true)}>
                <FiLogIn />
                <span>Sign in</span>
              </button>
            )}
            {user ? (
              <Popover
                opened={accountOpen && !isMobile}
                onChange={setAccountOpen}
                position="bottom-end"
                offset={10}
                radius="sm"
                shadow="xl"
                withinPortal
                transitionProps={{ transition: "pop-top-right", duration: 170 }}
              >
                <Popover.Target>
                  <AccountButton
                    accountLabel={accountLabel}
                    displayedLevel={displayedLevel}
                    disabled={profileLoading}
                    expanded={accountOpen && !isMobile}
                    profile={profile}
                    ringStyle={ringStyle}
                    onClick={() => setAccountOpen((current) => !current)}
                  />
                </Popover.Target>
                <Popover.Dropdown className="app-account-popover">
                  {accountPanel}
                </Popover.Dropdown>
              </Popover>
            ) : null}
          </div>
        </MagicHoverSurface>
      </motion.div>

      <motion.div
        className="app-nav-frame app-nav-frame--mobile-top"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <MagicHoverSurface as="nav" aria-label="Primary" className="app-nav app-nav--mobile-top">
          <BrandLink to={brandTarget} compact />
          {/* Signed-in users reach their account from the bottom bar; only guests
              get a top-strip action (sign in). */}
          <div className="mobile-top-actions">
            <button type="button" className="mobile-search-trigger" aria-label="Search site" onClick={() => setSearchOpen(true)}>
              <FiSearch />
            </button>
          {user ? null : (
            <button type="button" className="app-nav-predict app-nav-predict--public" onClick={() => setSignInOpen(true)}>
              <FiLogIn />
              <span>Sign in</span>
            </button>
          )}
          </div>
        </MagicHoverSurface>
      </motion.div>

      {user ? (
        <motion.div
          className="app-nav-frame app-nav-frame--mobile-bottom"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <MagicHoverSurface as="nav" aria-label="Primary mobile" className="mobile-app-nav">
            {mobileItems.map((item) =>
              item.action === "account" ? (
                <MobileAccountTab
                  key="account"
                  label={item.label}
                  profile={profile}
                  displayedLevel={displayedLevel}
                  ringStyle={ringStyle}
                  disabled={profileLoading}
                  active={accountOpen}
                  onClick={() => setAccountOpen(true)}
                />
              ) : (
                <MobileNavLink
                  key={`${item.to}-${item.label}`}
                  item={item}
                  onPredict={() => setPredictOpen(true)}
                />
              ),
            )}
          </MagicHoverSurface>
        </motion.div>
      ) : null}

      <div className="app-nav-spacer" aria-hidden />
      {user ? <div className="mobile-app-nav-spacer" aria-hidden /> : null}

      <SwipeSheet
        opened={accountOpen && isMobile}
        onClose={() => setAccountOpen(false)}
        drawerClassName="app-account-drawer"
        panelClassName="account-sheet"
        showClose
        aria-label="Account menu"
      >
        {accountPanel}
      </SwipeSheet>
      {user ? (
        <QuickPredictModal opened={predictOpen} onClose={() => setPredictOpen(false)} />
      ) : null}
      <SignInModal opened={signInOpen} onClose={() => setSignInOpen(false)} />
      <SiteSearch mobile opened={searchOpen} onClose={closeSearch} />
    </>
  );
}

function BrandLink({ to, compact = false }: { to: string; compact?: boolean }) {
  return (
    <Link to={to} className="app-nav-brand" aria-label="Ticker Wars home">
      <span className={compact ? "app-nav-brand-word app-nav-brand-word--compact" : "app-nav-brand-word"}>
        <span>Ticker</span>
        <strong>Wars</strong>
      </span>
    </Link>
  );
}

function AppNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `app-nav-link${isActive ? " app-nav-link--active" : ""}`}
    >
      {item.icon}
      <span>{item.label}</span>
    </NavLink>
  );
}

function MobileNavLink({ item, onPredict }: { item: NavItem; onPredict: () => void }) {
  const location = useLocation();

  // The Predict tab is an action, not a destination: it opens the quick
  // prediction modal instead of navigating.
  if (item.action === "predict") {
    return (
      <button
        type="button"
        onClick={onPredict}
        className={["mobile-app-nav-item", item.className].filter(Boolean).join(" ")}
      >
        <span className="mobile-app-nav-icon" aria-hidden>
          {item.icon}
        </span>
        <span className="mobile-app-nav-label">{item.label}</span>
      </button>
    );
  }

  const active = item.end
    ? location.pathname === item.to
    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={[
        "mobile-app-nav-item",
        item.className,
        active ? "mobile-app-nav-item--active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="mobile-app-nav-icon" aria-hidden>
        {item.icon}
      </span>
      <span className="mobile-app-nav-label">{item.label}</span>
    </Link>
  );
}

// The account "tab" in the bottom bar: a compact XP-ring avatar that opens the
// account sheet instead of navigating.
function MobileAccountTab({
  label,
  profile,
  displayedLevel,
  ringStyle,
  disabled,
  active,
  onClick,
}: {
  label: string;
  profile: ReturnType<typeof useAuth>["profile"];
  displayedLevel: number;
  ringStyle: CSSProperties;
  disabled: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mobile-app-nav-item mobile-app-nav-account${active ? " mobile-app-nav-item--active" : ""}`}
      aria-haspopup="menu"
      aria-expanded={active}
      aria-label="Open account menu"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="mobile-account-avatar">
        <span className="mobile-account-avatar-ring" style={ringStyle} aria-hidden />
        <span className="mobile-account-avatar-frame">
          {profile ? (
            <AvatarImage profile={profile} size={26} className="mobile-account-avatar-img" />
          ) : (
            <FiUser className="mobile-account-avatar-placeholder" />
          )}
        </span>
        <span className="mobile-account-avatar-level" aria-hidden>
          {displayedLevel}
        </span>
      </span>
      <span className="mobile-app-nav-label">{label}</span>
    </button>
  );
}

type AccountButtonProps = {
  accountLabel: string;
  displayedLevel: number;
  disabled: boolean;
  expanded: boolean;
  profile: ReturnType<typeof useAuth>["profile"];
  ringStyle: CSSProperties;
  onClick: () => void;
};

const AccountButton = forwardRef<HTMLButtonElement, AccountButtonProps>(function AccountButton(
  { accountLabel, displayedLevel, disabled, expanded, profile, ringStyle, onClick, ...rest },
  ref,
) {
  return (
    <Tooltip label={accountLabel}>
      <button
        {...rest}
        ref={ref}
        type="button"
        className="app-nav-account"
        aria-label={accountLabel}
        aria-haspopup="menu"
        aria-expanded={expanded}
        disabled={disabled}
        onClick={onClick}
      >
        <span className="app-nav-avatar-ring" style={ringStyle} aria-hidden />
        <span className="app-nav-avatar-frame">
          {profile ? (
            <AvatarImage profile={profile} size={42} className="app-nav-avatar" />
          ) : (
            <FiUser className="app-nav-avatar-placeholder" />
          )}
        </span>
        <span className="app-nav-level-badge" aria-label={`Level ${displayedLevel}`}>
          {displayedLevel}
        </span>
      </button>
    </Tooltip>
  );
});

type AccountPanelProps = {
  displayedLevel: number;
  profilePath: string;
  title: string;
  username: string;
  xpProgress: number;
  xpToNext: number;
  nextLevel: number;
  mobile: boolean;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
};

function AccountPanel({
  displayedLevel,
  profilePath,
  title,
  username,
  xpProgress,
  xpToNext,
  nextLevel,
  mobile,
  onNavigate,
  onSignOut,
}: AccountPanelProps) {
  return (
    <div className="app-account-menu">
      <div className="app-account-summary">
        <span className="app-account-kicker">Level {displayedLevel}</span>
        <strong>{username}</strong>
        <span>{title}</span>
      </div>
      <div className="app-account-progress">
        <span className="app-account-progress-track">
          <span style={{ width: `${Math.round(xpProgress * 100)}%` }} />
        </span>
        <span>{xpToNext.toLocaleString()} XP to Level {nextLevel}</span>
      </div>
      <div className="app-account-actions">
        <AccountAction icon={<FiUser />} label="View profile" onClick={() => onNavigate(profilePath)} />
        <AccountAction icon={<FiEdit3 />} label="Edit profile" onClick={() => onNavigate("/onboarding")} />
        {/* On mobile Rules is not in the bottom bar, so it lives here. */}
        {mobile ? (
          <AccountAction icon={<IoIosHelpCircle />} label="Rules" onClick={() => onNavigate("/rules")} />
        ) : null}
        <AccountAction icon={<FiLogOut />} label="Log out" danger onClick={onSignOut} />
      </div>
    </div>
  );
}

function AccountAction({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={danger ? "app-account-action app-account-action--danger" : "app-account-action"}
      onClick={onClick}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
