"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createContestAction } from "@/app/actions/create-contest";
import {
  ALLOWED_WINNER_COUNTS,
  buildPrizeSlabs,
  grossFromEntryAndSpots,
  netPrizePoolFromGross,
  roundMoney,
  type WinnerCount,
} from "@/lib/fantasy/prize-slabs";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LoadingOverlay } from "@/components/loading-overlay";

const ENTRY_CHIPS = [25, 50, 75];

function formatInr(n: number): string {
  const x = roundMoney(n);
  const isWhole = Math.round(x * 100) % 100 === 0;
  return `₹${x.toLocaleString(
    "en-IN",
    isWhole
      ? { maximumFractionDigits: 0, minimumFractionDigits: 0 }
      : { maximumFractionDigits: 2, minimumFractionDigits: 2 },
  )}`;
}

export function CreateContestWizard({
  matchId,
  matchTitle,
  startIso,
  defaultContestName,
  /** From server so preview matches create-contest server action (client-inlined env can be stale). */
  platformFeeFraction,
}: {
  matchId: number;
  matchTitle: string;
  startIso: string;
  defaultContestName: string;
  platformFeeFraction: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultContestName);
  const [entryStr, setEntryStr] = useState("10");
  const [spotsStr, setSpotsStr] = useState("10");
  const [winnerCount, setWinnerCount] = useState<WinnerCount>(1);
  const [submitting, setSubmitting] = useState(false);

  const entry = Math.max(0, Number(entryStr) || 0);
  const spots = Math.max(2, Math.min(10000, Math.floor(Number(spotsStr) || 0) || 2));

  const gross = useMemo(() => grossFromEntryAndSpots(entry, spots), [entry, spots]);
  const netPool = useMemo(
    () => netPrizePoolFromGross(gross, platformFeeFraction),
    [gross, platformFeeFraction],
  );

  const slabs = useMemo(() => buildPrizeSlabs(netPool, winnerCount), [netPool, winnerCount]);

  async function onContinue() {
    if (!name.trim()) {
      toast.error("Enter a contest name.");
      return;
    }
    setSubmitting(true);
    const res = await createContestAction({
      matchId,
      name: name.trim(),
      entryFee: entry,
      maxParticipants: spots,
      winnerCount,
      grossCollected: gross,
      isFlexible: true,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    router.push(`/matches/${matchId}/contests/${res.contestId}/squad`);
    router.refresh();
  }

  return (
    <div className="relative flex flex-col gap-6 pb-28">
      <LoadingOverlay show={submitting} label="Creating contest…" />
      <div className="border-border/80 bg-card/80 -mx-4 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/matches/${matchId}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-9 shrink-0 px-2",
            )}
          >
            ←
          </Link>
          <h1 className="font-heading text-center text-sm font-semibold sm:text-base">
            {matchTitle}
          </h1>
        </div>
        <p className="text-muted-foreground mt-1 text-center text-xs">
          Starts {new Date(startIso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <p className="text-muted-foreground mt-2 text-center text-[11px] leading-relaxed">
          After you create this contest, you&apos;ll pick a team from the same pool as
          joiners: official squads for the match, with playing XI marks once lineups sync.
        </p>
      </div>

      <div className="bg-muted/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
        <Label htmlFor="cc-name" className="sr-only">
          Contest name
        </Label>
        <Input
          id="cc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
          placeholder="Contest name"
        />
        <span className="text-muted-foreground text-xs" aria-hidden>
          ✎
        </span>
      </div>

      <div className="bg-card space-y-5 rounded-xl border p-4 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="cc-entry">Entry</Label>
          <Input
            id="cc-entry"
            inputMode="decimal"
            value={entryStr}
            onChange={(e) => setEntryStr(e.target.value.replace(/[^\d.]/g, ""))}
            className="min-h-12 text-lg font-semibold tabular-nums"
            placeholder="₹"
          />
          <div className="flex flex-wrap gap-2">
            {ENTRY_CHIPS.map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9"
                onClick={() => setEntryStr(String(v))}
              >
                ₹{v}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cc-spots">Spots</Label>
          <Input
            id="cc-spots"
            inputMode="numeric"
            value={spotsStr}
            onChange={(e) => setSpotsStr(e.target.value.replace(/\D/g, ""))}
            className="min-h-12 text-lg font-semibold tabular-nums"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-4">
          <div>
            <p className="text-muted-foreground text-xs font-medium">Max prize pool</p>
            <p className="text-primary text-lg font-bold tabular-nums">{formatInr(netPool)}</p>
            <p className="text-muted-foreground text-[10px]">
              {platformFeeFraction > 0 ? (
                <>
                  Gross {formatInr(gross)} if full · {(platformFeeFraction * 100).toFixed(1)}% platform fee ·
                  pool to winners {formatInr(netPool)}
                </>
              ) : (
                <>100% of entry fees go to the prize pool when all spots fill (no platform fee).</>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium">No. of winners</p>
            <p className="text-sm font-semibold">
              {winnerCount} (1st — {formatInr(slabs[0]?.amount ?? 0)})
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Select the number of winners</p>
        <div className="flex flex-wrap gap-2">
          {ALLOWED_WINNER_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setWinnerCount(n)}
              className={cn(
                "flex size-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                winnerCount === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted/60",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border">
        <div className="text-muted-foreground grid grid-cols-2 gap-2 border-b px-3 py-2 text-xs font-medium">
          <span>Rank</span>
          <span className="text-right">Max winnings</span>
        </div>
        <ul className="max-h-64 divide-y overflow-y-auto">
          {slabs.map((s) => (
            <li key={`${s.rank_from}-${s.rank_to}`} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
              <span className="tabular-nums">
                # {s.rank_from === s.rank_to ? s.rank_from : `${s.rank_from}–${s.rank_to}`}
              </span>
              <span className="text-right font-medium tabular-nums">{formatInr(s.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-primary/10 border-primary/25 text-primary-foreground/90 rounded-lg border px-3 py-2 text-center text-xs">
        This is a <strong className="text-foreground">Flexible Contest</strong> — it can run even if not all
        spots fill; prizes scale with participation.
      </div>

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed bottom-16 left-0 right-0 z-30 border-t p-3 backdrop-blur md:left-1/2 md:max-w-md md:-translate-x-1/2">
        <Button
          type="button"
          className="min-h-12 w-full bg-emerald-600 text-base font-semibold tracking-wide text-white hover:bg-emerald-600/90"
          disabled={submitting}
          onClick={() => void onContinue()}
        >
          {submitting ? "Creating…" : "CONTINUE"}
        </Button>
      </div>
    </div>
  );
}
