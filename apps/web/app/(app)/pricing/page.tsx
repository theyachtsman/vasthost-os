import { PageHeader } from '@/components/page-header';
import { PricingRecommendations } from '@/components/pricing-recommendations';

export default function PricingPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pricing Control"
        description="Recommended per-GPU asking prices from the live market — demand-adaptive, floored at your break-even. Review and apply to Vast with one click."
      />
      <PricingRecommendations />
    </div>
  );
}
