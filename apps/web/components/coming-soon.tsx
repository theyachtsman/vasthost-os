import { Badge, Card } from '@vasthost/ui';

import { PageHeader } from './page-header';

export function ComingSoon({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} actions={<Badge variant="accent">Coming soon</Badge>} />
      <Card className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <Badge variant="muted">{phase}</Badge>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </Card>
    </div>
  );
}
