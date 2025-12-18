import { generateToolMetadata } from "../../../lib/generate-tool-page";
import IniYamlJsonConverterClient from "./IniYamlJsonConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("ini-yaml-json-converter");

export default function IniYamlJsonConverterPage() {
  return <IniYamlJsonConverterClient />;
}

