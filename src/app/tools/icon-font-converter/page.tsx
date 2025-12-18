import { generateToolMetadata } from "../../../lib/generate-tool-page";
import IconFontConverterClient from "./IconFontConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("icon-font-converter");

export default function IconFontConverterPage() {
  return <IconFontConverterClient />;
}

