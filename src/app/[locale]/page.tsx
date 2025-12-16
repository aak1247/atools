import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ToolNavClient from "../ToolNavClient";
import { getMessages } from "../../i18n/messages";
import { isLocale } from "../../i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);
  return {
    title: `${messages.navTools} | ${messages.siteName}`,
    description: messages.homeDescription,
  };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale);

  return (
    <div className="space-y-16">
      <section className="relative mx-auto max-w-2xl text-center animate-fade-in-up">
        <div className="mb-6 inline-flex items-center rounded-full border border-blue-100 bg-blue-50/50 px-3 py-1 text-xs font-medium text-blue-600 backdrop-blur-sm">
          <span className="mr-2 flex h-2 w-2 rounded-full bg-blue-600" />
          {messages.homeBadge}
        </div>
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          {messages.homeTitlePrefix}
          <span className="text-gradient">{messages.homeTitleHighlight}</span>
        </h1>
        <p className="text-lg leading-8 text-slate-600">{messages.homeDescription}</p>
      </section>

      <ToolNavClient />
    </div>
  );
}
