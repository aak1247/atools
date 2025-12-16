import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonSchemaValidatorClient from "./JsonSchemaValidatorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-schema-validator");

export default function JsonSchemaValidatorPage() {
  return <JsonSchemaValidatorClient />;
}

