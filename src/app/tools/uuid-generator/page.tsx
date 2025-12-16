import { generateToolMetadata } from "../../../lib/generate-tool-page";
import UuidGeneratorClient from "./UuidGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("uuid-generator");

export default function UuidGeneratorPage() {
  return <UuidGeneratorClient />;
}
