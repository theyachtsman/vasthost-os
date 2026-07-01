import { MarketHub } from '@/components/market-hub';

// Signed-in Market Intelligence — same hub as the public homepage, with the
// user's own rigs overlaid.
export default function MarketPage() {
  return <MarketHub mode="app" />;
}
