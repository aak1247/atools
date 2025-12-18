import { generateToolMetadata } from "../../../lib/generate-tool-page";
import TomlJsonConverterClient from "./TomlJsonConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("toml-json-converter");

export default function TomlJsonConverterPage() {
  return <TomlJsonConverterClient />;
}

