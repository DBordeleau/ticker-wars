export type AuthProviderName = "google" | "discord" | "github";

export type AvatarOptions = {
  eyebrowsVariant: string;
  eyesVariant: string;
  glassesVariant: string;
  glassesProbability: number;
  mouthVariant: string;
  backgroundColor: string;
  scale: number;
  rotate: number;
};

export type UserProfile = {
  user_id: string;
  username: string;
  display_username: string;
  is_public: boolean;
  avatar_style: "adventurer-neutral";
  avatar_seed: string;
  avatar_options: AvatarOptions;
  note: string | null;
  note_moderation_status: "unreviewed" | "approved" | "rejected";
  onboarding_completed_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfileInput = {
  userId: string;
  displayUsername: string;
  isPublic: boolean;
  avatarSeed: string;
  avatarOptions: AvatarOptions;
};

