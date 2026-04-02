/** Avatar for player row; prefers DB photo_url, else generated placeholder. */
export function playerAvatarUrl(
  photoUrl: string | null | undefined,
  name: string,
): string {
  if (photoUrl?.trim()) return photoUrl.trim();
  const q = encodeURIComponent(name.slice(0, 40));
  return `https://ui-avatars.com/api/?name=${q}&size=128&background=1e3a5f&color=fff`;
}

/** Two-letter style label for user display (username or id fallback). */
export function initialsFromUsername(username: string | null | undefined): string {
  if (!username?.trim()) return "?";
  const t = username.trim();
  const parts = t.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[1]![0]).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

/** Profile image URL: Spaces/CDN URL or ui-avatars fallback from username. */
export function userProfileAvatarUrl(
  avatarUrl: string | null | undefined,
  username: string | null | undefined,
): string {
  if (avatarUrl?.trim()) return avatarUrl.trim();
  const u = username?.trim() || "User";
  const q = encodeURIComponent(u.slice(0, 40));
  return `https://ui-avatars.com/api/?name=${q}&size=128&background=1e3a5f&color=fff`;
}
