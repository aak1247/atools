import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ApiKeyGeneratorClient from "./ApiKeyGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("api-key-generator");

export default function ApiKeyGeneratorPage() {
  return <ApiKeyGeneratorClient />;
}