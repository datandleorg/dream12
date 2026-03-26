/** Avatar for player row; prefers DB photo_url, else generated placeholder. */
export function playerAvatarUrl(
  photoUrl: string | null | undefined,
  name: string,
): string {
  if (photoUrl?.trim()) return photoUrl.trim();
  const q = encodeURIComponent(name.slice(0, 40));
  return `https://ui-avatars.com/api/?name=${q}&size=128&background=1e3a5f&color=fff`;
}
