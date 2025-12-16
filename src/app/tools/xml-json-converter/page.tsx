import { generateToolMetadata } from "../../../lib/generate-tool-page";
import XmlJsonConverterClient from "./XmlJsonConverterClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("xml-json-converter");

export default function XmlJsonConverterPage() {
  return <XmlJsonConverterClient />;
}