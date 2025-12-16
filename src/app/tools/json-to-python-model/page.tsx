import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToPythonModelClient from "./JsonToPythonModelClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-python-model");

export default function JsonToPythonModelPage() {
  return <JsonToPythonModelClient />;
}

