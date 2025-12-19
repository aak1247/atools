import { generateToolMetadata } from "../../../lib/generate-tool-page";
import DocxPreviewToPdfClient from "./DocxPreviewToPdfClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("docx-preview-to-pdf");

export default function DocxPreviewToPdfPage() {
  return <DocxPreviewToPdfClient />;
}

