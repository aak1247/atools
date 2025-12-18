import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CspGeneratorClient from "./CspGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("csp-generator");

export default function CspGeneratorPage() {
  return <CspGeneratorClient />;
}

