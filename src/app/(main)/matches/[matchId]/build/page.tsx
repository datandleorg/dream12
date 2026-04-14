import { redirect } from "next/navigation";

export default async function BuildTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ contest?: string }>;
}) {
  const { matchId: mid } = await params;
  const { contest: contestId } = await searchParams;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId) || !contestId) {
    redirect(`/matches/${mid}`);
  }
  redirect(`/contests/${contestId}?tab=teams`);
}
