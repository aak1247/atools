import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfPageMergerClient from "./PdfPageMergerClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("pdf-page-merger");

export default function PdfPageMergerPage() {
  return <PdfPageMergerClient />;
}

