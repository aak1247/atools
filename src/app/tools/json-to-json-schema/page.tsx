import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToJsonSchemaClient from "./JsonToJsonSchemaClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-json-schema");

export default function JsonToJsonSchemaPage() {
  return <JsonToJsonSchemaClient />;
}

