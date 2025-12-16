import { generateToolMetadata } from "../../../lib/generate-tool-page";
import IcoGeneratorClient from "./IcoGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("ico-generator");

export default function IcoGeneratorPage() {
  return <IcoGeneratorClient />;
}
