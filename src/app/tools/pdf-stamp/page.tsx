import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfStampClient from "./PdfStampClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("pdf-stamp");

export default function PdfStampPage() {
  return <PdfStampClient />;
}
