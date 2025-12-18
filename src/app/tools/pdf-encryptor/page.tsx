import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PdfEncryptorClient from "./PdfEncryptorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("pdf-encryptor");

export default function PdfEncryptorPage() {
  return <PdfEncryptorClient />;
}

