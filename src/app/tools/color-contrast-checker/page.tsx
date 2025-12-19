import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ColorContrastCheckerClient from "./ColorContrastCheckerClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("color-contrast-checker");

export default function ColorContrastCheckerPage() {
  return <ColorContrastCheckerClient />;
}

