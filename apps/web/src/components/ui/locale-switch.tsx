'use client';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

/** ar / fr / en. Each option is labelled in its own language; switching re-renders with the mirrored layout. */
export function LocaleSwitch({ value, onChange, className }: { value?: Locale; onChange?: (l: Locale) => void; className?: string }) {
  const t = useTranslations('locale');
  const active = useLocale();
  const current = (value ?? active) as Locale;
  const router = useRouter();
  const choose = (l: Locale) => {
    if (onChange) return onChange(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div role="radiogroup" aria-label={t('label')} className={cn('inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-line p-1', className)}>
      <Languages aria-hidden className="ms-1.5 size-4 text-muted-foreground" />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === current}
          lang={l}
          onClick={() => choose(l)}
          className={cn('min-h-12 rounded-pill px-4 text-sm', l === current ? 'bg-brand-fill text-on-brand' : 'hover:bg-raised')}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
