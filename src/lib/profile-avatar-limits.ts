/** Shared limits for profile photo upload (client + server). */
/** Max size of the file picked in the browser (before client-side compression). */
export const MAX_PROFILE_AVATAR_INPUT_BYTES = 10 * 1024 * 1024;

/** Max size of the object uploaded to Spaces (after compression). */
export const MAX_PROFILE_AVATAR_BYTES = 2 * 1024 * 1024;

/** All uploads are re-encoded to JPEG client-side for predictable size. */
export const PROFILE_AVATAR_OUTPUT_CONTENT_TYPE = "image/jpeg" as const;

export const PROFILE_AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProfileAvatarContentType = (typeof PROFILE_AVATAR_CONTENT_TYPES)[number];
