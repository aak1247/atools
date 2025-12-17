import { generateToolMetadata } from "../../../lib/generate-tool-page";
import RandomPasswordGeneratorClient from "./RandomPasswordGeneratorClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("random-password-generator");

export default function RandomPasswordGeneratorPage() {
  return <RandomPasswordGeneratorClient />;
}

