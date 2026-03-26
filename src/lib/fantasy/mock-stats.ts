/** Deterministic mock stats for UI (replace with real aggregates later). */

function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function mockSelectionPct(playerId: string, contestId: string): number {
  const h = hash32(`${playerId}:${contestId}`);
  return Math.round((15 + (h % 7000) / 100) * 100) / 100;
}

export function mockCaptainPct(playerId: string, contestId: string): number {
  const h = hash32(`c:${playerId}:${contestId}`);
  return Math.round((h % 4500) / 100) / 100;
}

export function mockVicePct(playerId: string, contestId: string): number {
  const h = hash32(`vc:${playerId}:${contestId}`);
  return Math.round((h % 6000) / 100) / 100;
}
