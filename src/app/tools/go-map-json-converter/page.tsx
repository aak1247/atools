import { generateToolMetadata } from "../../../lib/generate-tool-page";
import GoMapJsonConverterClient from "./GoMapJsonConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("go-map-json-converter");

export default function GoMapJsonConverterPage() {
  return <GoMapJsonConverterClient />;
}