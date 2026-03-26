export type ContestVisibilityFields = {
  created_by: string | null;
  creator_joined_at: string | null;
};

export function isContestVisibleToUser(
  c: ContestVisibilityFields,
  userId?: string | null,
): boolean {
  if (!c.created_by) return true;
  if (c.creator_joined_at) return true;
  return userId != null && c.created_by === userId;
}

export function isCreatorDraftContest(
  c: ContestVisibilityFields,
  userId?: string | null,
): boolean {
  return Boolean(
    c.created_by && !c.creator_joined_at && userId && c.created_by === userId,
  );
}
