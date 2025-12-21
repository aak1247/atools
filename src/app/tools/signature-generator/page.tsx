import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SignatureGeneratorClient from "./SignatureGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("signature-generator");

export default function SignatureGeneratorPage() {
  return <SignatureGeneratorClient />;
}

