export function usd(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function dph(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$${value.toFixed(4)}/hr`;
}

// Renter-pay → host-receives. Market prices are post-Vast-fee (what the renter
// pays); the host pockets renter * (1 - fee). feePct is a fraction (0.25 = 25%).
export function hostTake(
  renter: number | null | undefined,
  feePct: number | null | undefined,
): number | null {
  if (renter == null || feePct == null) return null;
  return renter * (1 - feePct);
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value == null) return '—';
  return `${value.toFixed(digits)}%`;
}

export function num(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US');
}

export function gb(mb: number | null | undefined): string {
  if (mb == null) return '—';
  return `${Math.round(mb / 1024)} GB`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return 'never';
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function untilTime(iso: string | null | undefined): { label: string; soon: boolean } {
  if (!iso) return { label: '—', soon: false };
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return { label: '—', soon: false };
  const h = diff / 3_600_000;
  if (h < 0) return { label: 'expired', soon: true };
  if (h < 48) return { label: `${Math.round(h)}h`, soon: true };
  return { label: `${Math.round(h / 24)}d`, soon: false };
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
