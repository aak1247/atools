import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfRotateClient from "./PdfRotateClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("pdf-rotate");

export default function PdfRotatePage() {
  return <PdfRotateClient />;
}

