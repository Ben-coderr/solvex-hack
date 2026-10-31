import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getActorFromCookies } from '@/server/auth';
import { healthBody } from '@/server/health';
import { DispatchProviders } from './providers';

/** The operations room is dispatcher/admin only. A hospital account lands on its own ED view instead. */
export async function DispatchGate({ next, children }: { next: string; children: ReactNode }) {
  const actor = await getActorFromCookies();
  if (!actor) redirect(`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`);
  if (actor.role === 'hospital') {
    if (actor.hospitalId) redirect(`/hospital/${actor.hospitalId}`);
    const t = await getTranslations('app');
    return <main className="p-6 text-lg">{t('notAllowed')}</main>;
  }
  return <DispatchProviders health={healthBody()}>{children}</DispatchProviders>;
}
