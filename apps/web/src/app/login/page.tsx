'use client';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LocaleSwitch } from '@/components/ui/locale-switch';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BRAND } from '@/brand';

function LoginForm() {
  const t = useTranslations('login');
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    setBusy(false);
    if (error) return setError(t('failed'));
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    router.refresh();
  }

  return (
    <form action={submit} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{t('email')}</span>
        <input name="email" type="email" autoComplete="username" required dir="ltr"
          className="min-h-12 rounded-md border border-line bg-surface px-3 text-base" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{t('password')}</span>
        <input name="password" type="password" autoComplete="current-password" required dir="ltr"
          className="min-h-12 rounded-md border border-line bg-surface px-3 text-base" />
      </label>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</Button>
    </form>
  );
}

export default function LoginPage() {
  const t = useTranslations('login');
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold">{BRAND.name} <span className="font-ui text-2xl font-normal text-muted-foreground">{BRAND.nameAr}</span></h1>
        <p className="text-base text-muted-foreground">{t('subtitle')}</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <LocaleSwitch />
      <p className="text-sm text-muted-foreground">{t('prototype')}</p>
    </main>
  );
}
