import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale, type Locale } from './config';

/** First supported language in Accept-Language (e.g. a witness opening the link on their own phone). */
function fromAcceptLanguage(header: string | null): Locale | null {
  for (const part of (header ?? '').split(',')) {
    const tag = part.split(';')[0]!.trim().slice(0, 2).toLowerCase();
    if ((LOCALES as readonly string[]).includes(tag)) return tag as Locale;
  }
  return null;
}

// No locale in the URL: the dashboard is one app on one laptop; the choice lives in a cookie (LocaleSwitch).
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : (fromAcceptLanguage((await headers()).get('accept-language')) ?? DEFAULT_LOCALE);
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
