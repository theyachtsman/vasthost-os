import type { ReliabilityPoint } from '@vasthost/shared-types';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

// Trend arrow derived from the first vs last reliability points (history is
// returned newest-first).
export function ReliabilityTrend({ history }: { history: ReliabilityPoint[] }) {
  const points = history.filter((h) => h.reliability != null);
  if (points.length < 2) return <Minus className="h-3.5 w-3.5 text-muted" />;
  const latest = points[0].reliability!;
  const oldest = points[points.length - 1].reliability!;
  if (latest > oldest + 0.0005) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (latest < oldest - 0.0005) return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted" />;
}
