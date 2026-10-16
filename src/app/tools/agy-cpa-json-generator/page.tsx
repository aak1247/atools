import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AgyCpaJsonGeneratorClient from "./AgyCpaJsonGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("agy-cpa-json-generator");

export default function AgyCpaJsonGeneratorPage() {
  return <AgyCpaJsonGeneratorClient />;
}
