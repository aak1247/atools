import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ColorPaletteFromImageClient from "./ColorPaletteFromImageClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("color-palette-from-image");

export default function ColorPaletteFromImagePage() {
  return <ColorPaletteFromImageClient />;
}

