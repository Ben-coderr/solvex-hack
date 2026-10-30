'use client';
import { CircleAlert, Inbox, RotateCcw, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from './button';

/** No blank screens: every list has an empty state that says what will appear and when. */
export function EmptyState({ title, body, icon: Icon = Inbox, className }: { title?: string; body?: string; icon?: LucideIcon; className?: string }) {
  const t = useTranslations('state');
  return (
    <div className={cn('flex flex-col items-start gap-2 rounded-md border border-dashed border-line p-6', className)}>
      <Icon aria-hidden className="size-6 text-muted-foreground" />
      <p className="text-lg font-medium">{title ?? t('emptyTitle')}</p>
      <p className="text-base text-muted-foreground">{body ?? t('emptyBody')}</p>
    </div>
  );
}

/** Errors reassure first (nothing is lost), then offer one action. */
export function ErrorState({ title, body, onRetry, className }: { title?: string; body?: string; onRetry?: () => void; className?: string }) {
  const t = useTranslations('state');
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-2 rounded-md border border-status-danger p-6', className)}>
      <CircleAlert aria-hidden className="size-6 text-status-danger" />
      <p className="text-lg font-medium">{title ?? t('errorTitle')}</p>
      <p className="text-base text-muted-foreground">{body ?? t('errorBody')}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-2 h-auto min-h-12 max-w-full whitespace-normal">
          <RotateCcw aria-hidden />
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('najda-skeleton rounded-sm bg-raised', className)} />;
}

/** Loading placeholder shaped like the queue it replaces (no layout jump when data lands). */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  const t = useTranslations('state');
  return (
    <div role="status" aria-label={t('loading')} className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line px-3 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-col gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-5 w-10" />
        </div>
      ))}
    </div>
  );
}
