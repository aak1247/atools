import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MarkdownToConfluenceClient from "./MarkdownToConfluenceClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("markdown-to-confluence");

export default function MarkdownToConfluencePage() {
  return <MarkdownToConfluenceClient />;
}