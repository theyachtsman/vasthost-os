// Multi-market forward seam (Part 4): a reserved color token per market source.
// Only Vast renders today, but charts/filters reference these tokens now so a
// second source (RunPod) drops in without a design pass.
export type MarketSource = 'vast' | 'runpod';

export const MARKET_SOURCE_COLORS: Record<MarketSource, string> = {
  vast: 'hsl(243 75% 65%)', // indigo — the live source
  runpod: 'hsl(152 60% 48%)', // reserved teal-green — RunPod (not yet rendering)
};

export const MARKET_SOURCE_LABELS: Record<MarketSource, string> = {
  vast: 'Vast.ai',
  runpod: 'RunPod',
};

export const marketSourceColor = (s: string): string =>
  MARKET_SOURCE_COLORS[(s as MarketSource) in MARKET_SOURCE_COLORS ? (s as MarketSource) : 'vast'];
