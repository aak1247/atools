import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MarkdownToWordClient from "./MarkdownToWordClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("markdown-to-word");

export default function MarkdownToWordPage() {
  return <MarkdownToWordClient />;
}