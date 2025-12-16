import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToKotlinDataClassClient from "./JsonToKotlinDataClassClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-kotlin-data-class");

export default function JsonToKotlinDataClassPage() {
  return <JsonToKotlinDataClassClient />;
}

