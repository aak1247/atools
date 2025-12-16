import { generateToolMetadata } from "../../../lib/generate-tool-page";
import RsaKeyGeneratorClient from "./RsaKeyGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("rsa-key-generator");

export default function RsaKeyGeneratorPage() {
  return <RsaKeyGeneratorClient />;
}
