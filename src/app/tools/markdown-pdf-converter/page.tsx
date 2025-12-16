import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MarkdownPdfConverterClient from "./MarkdownPdfConverterClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("markdown-pdf-converter");

export default function MarkdownPdfConverterPage() {
  return <MarkdownPdfConverterClient />;
}