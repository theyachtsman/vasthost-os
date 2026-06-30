import { MarketHub } from '@/components/market-hub';

// The public homepage IS the Market Intelligence hub — no login wall (Part 3).
export default function HomePage() {
  return <MarketHub mode="guest" />;
}
