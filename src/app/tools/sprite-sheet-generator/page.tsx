import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SpriteSheetGeneratorClient from "./SpriteSheetGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("sprite-sheet-generator");

export default function SpriteSheetGeneratorPage() {
  return <SpriteSheetGeneratorClient />;
}

