'use client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/states';

export const useWitnessLink = (incidentId: string | null, enabled = true) =>
  useQuery({
    queryKey: ['witness-link', incidentId],
    queryFn: () => api<{ url: string; svg: string }>(`/api/incidents/${incidentId}/witness-link`),
    enabled: !!incidentId && enabled,
    staleTime: Infinity, // the token is stable for an id
  });

/**
 * D10 QR to the witness page. Always black on white, whatever the theme: phone cameras need the contrast.
 * The SVG comes from our own server (qrcode library), never from user input.
 */
export function WitnessQr({ incidentId, className, showUrl = true }: { incidentId: string; className?: string; showUrl?: boolean }) {
  const t = useTranslations('detail.witness');
  const q = useWitnessLink(incidentId);
  if (q.isError) return <p role="alert" className="text-sm text-status-danger">{t('loadError')}</p>;
  if (!q.data) return <Skeleton className={cn('aspect-square w-40', className)} />;
  return (
    <figure className="flex flex-col items-start gap-2">
      <div role="img" aria-label={t('qrLabel', { id: incidentId })} data-testid="witness-qr"
        className={cn('aspect-square w-40 rounded-md bg-white p-2 [&_svg]:size-full', className)}
        dangerouslySetInnerHTML={{ __html: q.data.svg }} />
      {showUrl && (
        <figcaption className="packet-ltr break-all font-mono text-xs text-muted-foreground" data-testid="witness-url">{q.data.url}</figcaption>
      )}
    </figure>
  );
}
