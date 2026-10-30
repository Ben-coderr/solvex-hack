import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, isLocale } from '@/i18n/config';

// Public: the login page, every /api route (each one enforces its own auth), the styleguide, and the
// capability-link pages built in P6 (/w, /crew) which authenticate with a signed token instead of a session.
const PUBLIC = [/^\/login$/, /^\/api\//, /^\/styleguide$/, /^\/w\//, /^\/crew\//];
const DEMO_ONLY = [/^\/phones(\/|$)/, /^\/demo(\/|$)/];

/** Refresh the Supabase session cookies on every page request and send signed-out users to /login. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (DEMO_ONLY.some((r) => r.test(path)) && process.env.DEMO_MODE !== 'true') {
    return new NextResponse('Not found', { status: 404 });
  }

  // `?lang=ar|fr|en` (plain links on the public witness page, no JS needed): remember it like the LocaleSwitch does.
  const lang = request.nextUrl.searchParams.get('lang');
  if (lang && isLocale(lang)) request.cookies.set(LOCALE_COOKIE, lang);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Nothing between createServerClient and getClaims: it is what refreshes an expired access token.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !PUBLIC.some((r) => r.test(path))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (lang && isLocale(lang)) {
    response.cookies.set(LOCALE_COOKIE, lang, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  }
  return response; // carries any refreshed session cookies
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|pmtiles|mjs)$).*)'],
};
