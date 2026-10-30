import { getTranslations } from 'next-intl/server';

/** Shown while the server checks the link (slow 2G): no blank screen. */
export default async function Loading() {
  const t = await getTranslations('witnessPage');
  return (
    <main role="status" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8">
      <p className="text-lg text-muted-foreground">{t('loading')}</p>
      <div aria-hidden className="najda-skeleton h-40 rounded-md bg-raised" />
      <div aria-hidden className="najda-skeleton h-40 rounded-md bg-raised" />
    </main>
  );
}
