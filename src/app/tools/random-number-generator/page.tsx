import { generateToolMetadata } from "../../../lib/generate-tool-page";
import RandomNumberGeneratorClient from "./RandomNumberGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("random-number-generator");

export default function RandomNumberGeneratorPage() {
  return <RandomNumberGeneratorClient />;
}
