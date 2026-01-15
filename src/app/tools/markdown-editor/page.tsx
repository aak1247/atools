import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MarkdownEditorClient from "./MarkdownEditorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("markdown-editor");

export default function MarkdownEditorPage() {
  return <MarkdownEditorClient />;
}
