import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PaletteGeneratorClient from "./PaletteGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("palette-generator");

export default function PaletteGeneratorPage() {
  return <PaletteGeneratorClient />;
}
