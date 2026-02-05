import { generateToolMetadata } from "../../../lib/generate-tool-page";
import HtmlToMarkdownClient from "./HtmlToMarkdownClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("html-to-markdown");

export default function HtmlToMarkdownPage() {
  return <HtmlToMarkdownClient />;
}

