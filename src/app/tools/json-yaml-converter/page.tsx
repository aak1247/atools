import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonYamlConverterClient from "./JsonYamlConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-yaml-converter");

export default function JsonYamlConverterPage() {
  return <JsonYamlConverterClient />;
}
