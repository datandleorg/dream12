/** Match-level saved team builder: no contest roster draft in DB until preview. */
export type SquadSavedFlow = {
  basePath: string;
  backHref: string;
  /** e.g. `?returnTo=...` — append to squad/captain/preview navigations */
  stepQuerySuffix?: string;
};
