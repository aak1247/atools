import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CsrGeneratorClient from "./CsrGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("csr-generator");

export default function CsrGeneratorPage() {
  return <CsrGeneratorClient />;
}

