import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_LOCALE } from "../i18n/locales";
import { buildClientRedirectScript } from "../i18n/detect-locale";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function RootPage() {
  const redirectScript = buildClientRedirectScript();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <script
        dangerouslySetInnerHTML={{
          __html: redirectScript,
        }}
      />
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=/${DEFAULT_LOCALE}`} />
      </noscript>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Redirecting...</p>
        <div className="flex justify-center gap-4 text-xs text-blue-600">
          <Link href="/zh-cn">中文版</Link>
          <span>·</span>
          <Link href="/en-us">English</Link>
        </div>
      </div>
    </main>
  );
}
