import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { dirOf, isLocale, DEFAULT_LOCALE } from "@/i18n/config";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from '@/brand';

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Decision support for road-accident response (prototype, synthetic data).",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  // Night-first (docs/06 §1): dark unless the user chose light.
  const theme = (await cookies()).get("sellekni-theme")?.value === "light" ? "light" : "dark";
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      data-theme={theme}
      className={cn("h-full", "antialiased", plexArabic.variable, plexMono.variable, bricolage.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
