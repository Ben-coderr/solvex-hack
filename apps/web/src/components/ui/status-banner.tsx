'use client';
import { CloudOff, FlaskConical, MessageSquareText, Play, Wifi, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type ConnectivityMode = 'online' | 'sms_only' | 'offline' | 'replay' | 'demo';

const MODE: Record<ConnectivityMode, { icon: LucideIcon; cls: string }> = {
  online: { icon: Wifi, cls: 'border-line text-muted-foreground' },
  // SMS-only is a designed, first-class state, not an error.
  sms_only: { icon: MessageSquareText, cls: 'border-status-info text-status-info' },
  offline: { icon: CloudOff, cls: 'border-status-warn text-status-warn' },
  // Demo modes are impossible to miss: inverted brand strip on every screen.
  replay: { icon: Play, cls: 'border-brand-fill bg-brand-fill text-on-brand font-semibold' },
  demo: { icon: FlaskConical, cls: 'border-brand-fill bg-brand-fill text-on-brand font-semibold' },
};

/** Persistent strip, never hidden: connectivity + REPLAY/DEMO labelling (non-negotiable #4). */
export function StatusBanner({ mode, className }: { mode: ConnectivityMode; className?: string }) {
  const t = useTranslations('status');
  const m = MODE[mode];
  return (
    <div role="status" className={cn('flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm', m.cls, className)}>
      <m.icon aria-hidden className="size-4 shrink-0" />
      <span>{t(mode)}</span>
    </div>
  );
}
