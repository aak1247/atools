import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CitationFormatterClient from "./CitationFormatterClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("citation-formatter");

export default function CitationFormatterPage() {
  return <CitationFormatterClient />;
}

