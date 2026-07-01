import { Card, CardContent, CardHeader, CardTitle } from '@vasthost/ui';

export function Widget({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
