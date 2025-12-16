import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ColorPickerClient from "./ColorPickerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("color-picker");

export default function ColorPickerPage() {
  return <ColorPickerClient />;
}
