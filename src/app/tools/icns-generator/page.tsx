import { generateToolMetadata } from "../../../lib/generate-tool-page";
import IcnsGeneratorClient from "./IcnsGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("icns-generator");

export default function IcnsGeneratorPage() {
  return <IcnsGeneratorClient />;
}
