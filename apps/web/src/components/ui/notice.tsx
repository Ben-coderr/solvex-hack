import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A boxed state message for the public capability pages (witness, crew): works server-rendered, without JS. */
export function Notice({ icon: Icon, tone, title, body, role, testId }: {
  icon: LucideIcon; tone: 'ok' | 'warn' | 'danger' | 'info'; title: string; body?: string; role?: 'alert'; testId?: string;
}) {
  const color = { ok: 'border-status-ok text-status-ok', warn: 'border-status-warn text-status-warn', danger: 'border-status-danger text-status-danger', info: 'border-status-info text-status-info' }[tone];
  return (
    <div role={role ?? 'status'} data-testid={testId} className={cn('flex items-start gap-3 rounded-md border-2 bg-surface p-4', color)}>
      <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
      <div className="flex flex-col gap-1 text-text">
        <p className="text-lg font-semibold">{title}</p>
        {body && <p className="text-base text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}
