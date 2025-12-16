import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SaltGeneratorClient from "./SaltGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("salt-generator");

export default function SaltGeneratorPage() {
  return <SaltGeneratorClient />;
}
