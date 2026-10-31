'use client';
import { FlaskConical, LayoutDashboard, LogOut, Moon, ScrollText, Smartphone, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BrandLockup } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/button';
import { LocaleSwitch } from '@/components/ui/locale-switch';
import { useHealth } from '@/lib/dispatch';
import { supabaseBrowser } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { BRAND } from '@/brand';

export function ThemeToggle() {
  const t = useTranslations('app');
  const router = useRouter();
  const flip = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next; // instant, then the server render agrees via the cookie
    document.cookie = `sellekni-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <Button variant="ghost" size="icon" onClick={flip} aria-label={t('theme')} title={t('theme')}>
      <Sun aria-hidden className="hidden dark:block" />
      <Moon aria-hidden className="dark:hidden" />
    </Button>
  );
}

export function SignOut() {
  const t = useTranslations('app');
  const router = useRouter();
  return (
    <Button variant="ghost" size="icon" aria-label={t('signOut')} title={t('signOut')}
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}>
      <LogOut aria-hidden className="rtl:-scale-x-100" />
    </Button>
  );
}

/** Brand + navigation + tools. Wraps on narrow screens; nothing is hidden behind a menu. */
export function AppHeader({ actions, nav = true }: { actions?: ReactNode; nav?: boolean }) {
  const t = useTranslations('app');
  const td = useTranslations('demo');
  const path = usePathname();
  const demo = useHealth().data?.demo ?? false;
  const links = [
    { href: '/', label: t('queue'), icon: LayoutDashboard },
    { href: '/audit', label: t('audit'), icon: ScrollText },
    ...(demo
      ? [{ href: '/demo', label: td('nav'), icon: FlaskConical }, { href: '/phones', label: td('open.phones'), icon: Smartphone }]
      : []),
  ];
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2">
      <Link href="/" aria-label={BRAND.name} className="inline-flex min-h-12 items-center rounded-md md:min-h-0"><BrandLockup /></Link>
      {nav && (
        <nav aria-label={t('nav')} className="flex min-w-0 flex-wrap items-center gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}
              className={cn('inline-flex min-h-12 items-center gap-1.5 rounded-md px-3 text-base hover:bg-raised md:min-h-10',
                path === l.href ? 'font-semibold text-text' : 'text-muted-foreground')}>
              <l.icon aria-hidden className="size-4" />
              {l.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="ms-auto flex flex-wrap items-center gap-2">
        {actions}
        <LocaleSwitch className="md:[&_button]:min-h-10 md:[&_button]:px-3" />
        <ThemeToggle />
        <SignOut />
      </div>
    </header>
  );
}
