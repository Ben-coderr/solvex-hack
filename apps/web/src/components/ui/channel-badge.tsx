'use client';
import { Check, CheckCheck, ClipboardPaste, Eye, FlaskConical, Globe, MessageSquareText, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type Channel = 'https' | 'sms' | 'paste' | 'witness' | 'sim';
export type ChannelStatus = 'sent' | 'retrying' | 'acked' | 'failed';

const CHANNEL_ICON: Record<Channel, LucideIcon> = { https: Globe, sms: MessageSquareText, paste: ClipboardPaste, witness: Eye, sim: FlaskConical };
const STATUS: Record<ChannelStatus, { icon: LucideIcon; cls: string }> = {
  sent: { icon: Check, cls: 'text-status-info' },
  retrying: { icon: RefreshCw, cls: 'text-status-warn' },
  acked: { icon: CheckCheck, cls: 'text-status-ok' },
  failed: { icon: X, cls: 'text-status-danger' },
};

/** How a report travelled and what happened to it. Icon + word, never colour alone. */
export function ChannelBadge({ channel, status, className }: { channel: Channel; status?: ChannelStatus; className?: string }) {
  const t = useTranslations('channel');
  const Icon = CHANNEL_ICON[channel];
  const s = status ? STATUS[status] : null;
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-pill border border-line px-2 py-0.5 text-sm', className)}>
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      <span>{t(channel)}</span>
      {s && (
        <span className={cn('inline-flex items-center gap-1', s.cls)}>
          <s.icon aria-hidden className={cn('size-3.5', status === 'retrying' && 'animate-spin [animation-duration:2s] motion-reduce:animate-none')} />
          {t(status!)}
        </span>
      )}
    </span>
  );
}
