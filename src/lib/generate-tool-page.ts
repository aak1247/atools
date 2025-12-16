import { Metadata } from 'next';
import { getToolConfig } from './tool-config';

export function generateToolMetadata(toolSlug: string): Metadata {
  const config = getToolConfig(toolSlug);
  
  return {
    title: config.name,
    description: config.seoDescription || config.description,
    keywords: config.keywords?.join(',') || '',
    manifest: `/tools/${toolSlug}/manifest.webmanifest`,
    openGraph: {
      title: config.name,
      description: config.description,
      type: 'website',
    },
    alternates: {
      canonical: `/tools/${toolSlug}`,
    },
  };
}