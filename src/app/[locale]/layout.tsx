import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import LocaleSwitcher from "../../components/LocaleSwitcher";
import { I18nProvider } from "../../i18n/I18nProvider";
import LocaleHtmlLang from "../../i18n/LocaleHtmlLang";
import { getMessages } from "../../i18n/messages";
import { isLocale, SUPPORTED_LOCALES } from "../../i18n/locales";
import { PwaActionsBar } from "../pwa-actions";

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale);

  return (
    <I18nProvider locale={locale} messages={messages}>
      <LocaleHtmlLang locale={locale} />
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 w-full glass border-b border-white/20 transition-all duration-300">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900 transition-opacity hover:opacity-80"
            >
              <Image
                src="/icon.svg"
                alt={messages.siteName}
                width={24}
                height={24}
                className="rounded-lg shadow-sm"
              />
              <span>{messages.siteName}</span>
            </Link>

            <nav className="flex items-center gap-3 text-sm font-medium text-slate-600">
              <Link href={`/${locale}`} className="transition-colors hover:text-slate-900">
                {messages.navTools}
              </Link>
              <Link href="/sitemap.xml" className="transition-colors hover:text-slate-900">
                {messages.navSitemap}
              </Link>
              <a
                href="https://github.com/aak1247/atools"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-slate-900"
              >
                {messages.navGithub}
              </a>
              <a
                href="https://github.com/aak1247/atools/issues/new?template=bug_report.yml"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-slate-900"
              >
                {messages.navReportIssue}
              </a>
              <LocaleSwitcher />
            </nav>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <PwaActionsBar />
            {children}
          </div>
        </main>

        <footer className="border-t border-slate-200/60 bg-white/50 py-8 text-center text-xs text-slate-500 backdrop-blur-sm">
          <div className="mx-auto max-w-5xl px-4">
            <p>
              © {new Date().getFullYear()} {messages.siteName}. {messages.footerTagline}
            </p>
          </div>
        </footer>
      </div>
    </I18nProvider>
  );
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}
