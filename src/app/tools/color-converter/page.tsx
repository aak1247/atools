import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ColorConverterClient from "./ColorConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("color-converter");

export default function ColorConverterPage() {
  return <ColorConverterClient />;
}
