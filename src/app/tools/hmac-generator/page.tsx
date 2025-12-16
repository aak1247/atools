import { generateToolMetadata } from "../../../lib/generate-tool-page";
import HmacGeneratorClient from "./HmacGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("hmac-generator");

export default function HmacGeneratorPage() {
  return <HmacGeneratorClient />;
}
