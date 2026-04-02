"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Source = "local" | "archive" | "wallet";

type FileRow = Record<string, unknown>;

type ArchiveKey = { key: string; lastModified?: string; size?: number };

type WalletRow = {
  id: string;
  user_id: string;
  previous_balance: number;
  new_balance: number;
  changed_at: string;
};

function kindOf(row: FileRow): string {
  const k = row.kind;
  return typeof k === "string" ? k : "—";
}

function summaryCell(row: FileRow): string {
  const k = kindOf(row);
  if (k === "http") {
    const method = row.method;
    const path = row.path;
    const status = row.status;
    return `${typeof method === "string" ? method : "?"} ${typeof path === "string" ? path : ""} → ${typeof status === "number" ? status : "?"}`;
  }
  if (k === "activity" || k === "cron") {
    const a = row.action ?? row.route;
    return typeof a === "string" ? a : JSON.stringify(a ?? "");
  }
  return "—";
}

function timeOf(row: FileRow): string {
  const t = row.time;
  if (typeof t === "number") {
    try {
      return new Date(t).toISOString();
    } catch {
      return String(t);
    }
  }
  return "—";
}

export function AdminServerLogsClient() {
  const [source, setSource] = useState<Source>("local");
  const [kind, setKind] = useState<string>("");
  const [cursor, setCursor] = useState("0");
  const [rows, setRows] = useState<FileRow[]>([]);
  const [walletRows, setWalletRows] = useState<WalletRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [archiveKeys, setArchiveKeys] = useState<ArchiveKey[]>([]);
  const [archiveToken, setArchiveToken] = useState<string | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [walletTotal, setWalletTotal] = useState<number | null>(null);
  const prevSource = useRef<Source | null>(null);

  const loadLocal = useCallback(async (nextCursor: string, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({
        limit: "50",
        cursor: nextCursor,
      });
      if (kind) sp.set("kind", kind);
      const res = await fetch(`/api/admin/server-logs/local?${sp}`, { credentials: "include" });
      const data = (await res.json()) as {
        rows?: FileRow[];
        nextCursor?: string;
        hasMore?: boolean;
        fileSize?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setRows((prev) => (append ? [...prev, ...(data.rows ?? [])] : (data.rows ?? [])));
      setCursor(data.nextCursor ?? "0");
      setHasMore(Boolean(data.hasMore));
      setFileSize(typeof data.fileSize === "number" ? data.fileSize : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  const loadArchivePage = useCallback(
    async (key: string, nextCursor: string, append: boolean) => {
      if (!key) return;
      setLoading(true);
      setError(null);
      try {
        const sp = new URLSearchParams({
          key,
          limit: "50",
          cursor: nextCursor,
        });
        if (kind) sp.set("kind", kind);
        const res = await fetch(`/api/admin/server-logs/archive-body?${sp}`, {
          credentials: "include",
        });
        const data = (await res.json()) as {
          rows?: FileRow[];
          nextCursor?: string;
          hasMore?: boolean;
          fileSize?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        setRows((prev) => (append ? [...prev, ...(data.rows ?? [])] : (data.rows ?? [])));
        setCursor(data.nextCursor ?? "0");
        setHasMore(Boolean(data.hasMore));
        setFileSize(typeof data.fileSize === "number" ? data.fileSize : null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [kind],
  );

  const loadWallet = useCallback(async (nextCursor: string, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ limit: "50", cursor: nextCursor });
      const res = await fetch(`/api/admin/server-logs/wallet?${sp}`, { credentials: "include" });
      const data = (await res.json()) as {
        rows?: WalletRow[];
        nextCursor?: string;
        hasMore?: boolean;
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setWalletRows((prev) => (append ? [...prev, ...(data.rows ?? [])] : (data.rows ?? [])));
      setCursor(data.nextCursor ?? "0");
      setHasMore(Boolean(data.hasMore));
      setWalletTotal(typeof data.total === "number" ? data.total : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadArchivesList = useCallback(async (token?: string, append?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ maxKeys: "100" });
      if (token) sp.set("continuationToken", token);
      const res = await fetch(`/api/admin/server-logs/archives?${sp}`, { credentials: "include" });
      const data = (await res.json()) as {
        keys?: ArchiveKey[];
        nextContinuationToken?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setArchiveKeys((prev) => (append ? [...prev, ...(data.keys ?? [])] : (data.keys ?? [])));
      setArchiveToken(data.nextContinuationToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setExpanded(null);
    setCursor("0");

    if (source === "archive") {
      setRows([]);
      setWalletRows([]);
      const enteredArchive = prevSource.current !== "archive";
      if (enteredArchive) {
        setSelectedKey("");
        prevSource.current = "archive";
        void loadArchivesList(undefined, false);
        return;
      }
      prevSource.current = "archive";
      if (!selectedKey) {
        void loadArchivesList(undefined, false);
        return;
      }
      void loadArchivePage(selectedKey, "0", false);
      return;
    }

    prevSource.current = source;

    if (source === "wallet") {
      setRows([]);
      setWalletRows([]);
      void loadWallet("0", false);
      return;
    }

    setRows([]);
    setWalletRows([]);
    void loadLocal("0", false);
  }, [
    source,
    kind,
    selectedKey,
    loadLocal,
    loadArchivePage,
    loadArchivesList,
    loadWallet,
  ]);

  const requestIdOf = (row: FileRow) =>
    typeof row.requestId === "string" ? row.requestId : JSON.stringify(row.time ?? Math.random());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Source</span>
        <Button
          type="button"
          variant={source === "local" ? "default" : "outline"}
          size="sm"
          onClick={() => setSource("local")}
        >
          Live file
        </Button>
        <Button
          type="button"
          variant={source === "archive" ? "default" : "outline"}
          size="sm"
          onClick={() => setSource("archive")}
        >
          Spaces archives
        </Button>
        <Button
          type="button"
          variant={source === "wallet" ? "default" : "outline"}
          size="sm"
          onClick={() => setSource("wallet")}
        >
          Wallet (DB)
        </Button>
      </div>

      {source !== "wallet" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-muted-foreground text-sm" htmlFor="log-kind">
            Kind
          </label>
          <select
            id="log-kind"
            className="border-input bg-background rounded-md border px-2 py-1 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">All</option>
            <option value="http">http (requests)</option>
            <option value="activity">activity</option>
            <option value="cron">cron</option>
          </select>
          {fileSize != null && source === "local" ? (
            <span className="text-muted-foreground text-xs">File size {fileSize} bytes</span>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Postgres trigger audit of `wallet_balance` changes (paginated). Apply migration{" "}
          <code className="text-xs">20260402180000_wallet_balance_audit.sql</code> if this errors.
          {walletTotal != null ? ` Total rows: ${walletTotal}.` : null}
        </p>
      )}

      {source === "archive" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-muted-foreground text-sm" htmlFor="arc-key">
              Archive object
            </label>
            <select
              id="arc-key"
              className="border-input bg-background max-w-full min-w-[12rem] rounded-md border px-2 py-1 text-sm"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              <option value="">Select gzip archive…</option>
              {archiveKeys.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.key.split("/").pop()} ({k.size ?? "?"} B)
                </option>
              ))}
            </select>
            {archiveToken ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void loadArchivesList(archiveToken, true)}>
                More archives
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {source === "wallet" ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Previous</TableHead>
                <TableHead>New</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {walletRows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-sm">
                    No rows.
                  </TableCell>
                </TableRow>
              ) : (
                walletRows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(w.changed_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{w.user_id.slice(0, 8)}…</TableCell>
                    <TableCell className="tabular-nums text-sm">₹{Number(w.previous_balance).toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums text-sm">₹{Number(w.new_balance).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Request ID</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    No log lines in this page.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => {
                  const id = `${requestIdOf(row)}-${idx}`;
                  const open = expanded === id;
                  return (
                    <Fragment key={id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded(open ? null : id)}
                      >
                        <TableCell className="whitespace-nowrap text-xs">{timeOf(row)}</TableCell>
                        <TableCell className="text-sm">{kindOf(row)}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs">{summaryCell(row)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {typeof row.requestId === "string" ? row.requestId.slice(0, 12) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{typeof row.ip === "string" ? row.ip : "—"}</TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <pre className="bg-muted max-h-80 overflow-auto rounded-md p-2 text-xs">
                              {JSON.stringify(row, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {source === "wallet" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || !hasMore}
            onClick={() => void loadWallet(cursor, true)}
          >
            {loading ? "Loading…" : hasMore ? "Load more" : "End"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              loading ||
              !hasMore ||
              (source === "archive" && !selectedKey)
            }
            onClick={() =>
              source === "local"
                ? void loadLocal(cursor, true)
                : void loadArchivePage(selectedKey, cursor, true)
            }
          >
            {loading ? "Loading…" : hasMore ? "Load more" : "End"}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => {
            setCursor("0");
            if (source === "local") void loadLocal("0", false);
            else if (source === "archive" && selectedKey) void loadArchivePage(selectedKey, "0", false);
            else if (source === "wallet") void loadWallet("0", false);
          }}
        >
          Refresh first page
        </Button>
      </div>
    </div>
  );
}
