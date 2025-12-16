"use client";

import nextDynamic from "next/dynamic";
import type { ComponentType } from "react";
import { toolLoaders, toolSlugs, type ToolSlug } from "../../../tools/tool-registry";
import { ToolConfigProvider } from "../../../../components/ToolConfigProvider";
import type { ToolConfig } from "../../../../types/tools";

const toolComponents = Object.fromEntries(
  toolSlugs.map((slug) => [
    slug,
    nextDynamic(async () => (await toolLoaders[slug]()).default, { ssr: false }),
  ]),
) as Record<ToolSlug, ComponentType>;

export default function ToolClientRenderer({ slug }: { slug: ToolSlug }) {
  const ToolClient = toolComponents[slug];
  return <ToolClient />;
}

export function ToolClientRendererWithConfig({
  slug,
  locale,
  config,
}: {
  slug: ToolSlug;
  locale: string;
  config: ToolConfig;
}) {
  const ToolClient = toolComponents[slug];
  return (
    <ToolConfigProvider toolSlug={slug} locale={locale} config={config}>
      <ToolClient />
    </ToolConfigProvider>
  );
}
