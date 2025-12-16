import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfMergeClient from "./PdfMergeClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("pdf-merge");

export default function PdfMergePage() {
  return <PdfMergeClient />;
}
