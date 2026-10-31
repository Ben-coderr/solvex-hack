'use client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, hhmm } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/states';

export const useCrewLink = (incidentId: string | null, enabled = true) =>
  useQuery({
    queryKey: ['crew-link', incidentId],
    queryFn: () => api<{ url: string; svg: string; expiresAt: string }>(`/api/incidents/${incidentId}/crew-link`),
    enabled: !!incidentId && enabled,
    staleTime: 3_600_000, // a fresh 12 h token is minted per fetch: refresh at most hourly
  });

/**
 * D9 crew link: QR (black on white for phone cameras) + the URL to paste into an SMS or a radio-room chat.
 * The SVG comes from our own server (qrcode library), never from user input.
 */
export function CrewLink({ incidentId, className, showUrl = true }: { incidentId: string; className?: string; showUrl?: boolean }) {
  const t = useTranslations('detail.crew');
  const q = useCrewLink(incidentId);
  if (q.isError) return <p role="alert" className="text-sm text-status-danger">{t('loadError')}</p>;
  if (!q.data) return <Skeleton className={cn('aspect-square w-40', className)} />;
  return (
    <figure className="flex flex-col items-start gap-2">
      <div role="img" aria-label={t('qrLabel', { id: incidentId })} data-testid="crew-qr"
        className={cn('aspect-square w-40 rounded-md bg-white p-2 [&_svg]:size-full', className)}
        dangerouslySetInnerHTML={{ __html: q.data.svg }} />
      {showUrl && (
        <figcaption className="flex flex-col gap-1">
          <span className="packet-ltr break-all font-mono text-xs text-muted-foreground" data-testid="crew-url">{q.data.url}</span>
          <span className="text-xs text-muted-foreground">{t('expires', { time: hhmm(q.data.expiresAt) })}</span>
        </figcaption>
      )}
    </figure>
  );
}
