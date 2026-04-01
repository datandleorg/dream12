/**
 * Whether a signed-in user may load another user's fantasy XI for a contest
 * (e.g. leaderboard team preview). Others' teams stay hidden until the match
 * leaves `upcoming`.
 */
export function canViewOthersContestTeamPreview(params: {
  matchStatus: string;
  viewerUserId: string;
  teamOwnerUserId: string;
}): boolean {
  if (params.viewerUserId === params.teamOwnerUserId) return true;
  return params.matchStatus !== "upcoming";
}
