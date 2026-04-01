/** Human-readable venue / stage lines for match cards and detail headers. */
export function venueStageLabels(
  venue: { name?: string | null; city?: string | null } | null | undefined,
  stage: { name?: string | null; code?: string | null } | null | undefined,
): { venueLine: string | null; stageLine: string | null } {
  const vname = venue?.name?.trim();
  const vcity = venue?.city?.trim();
  const venueLine =
    vname && vcity ? `${vname}, ${vcity}` : vname ?? vcity ?? null;
  const sname = stage?.name?.trim();
  const scode = stage?.code?.trim();
  const stageLine =
    sname && scode ? `${sname} · ${scode}` : sname ?? scode ?? null;
  return { venueLine, stageLine };
}
