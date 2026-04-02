/** Shared limits for profile photo upload (client + server). */
export const MAX_PROFILE_AVATAR_BYTES = 2 * 1024 * 1024;

export const PROFILE_AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProfileAvatarContentType = (typeof PROFILE_AVATAR_CONTENT_TYPES)[number];
