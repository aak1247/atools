import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToCsvClient from "./JsonToCsvClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-csv");

export default function JsonToCsvPage() {
  return <JsonToCsvClient />;
}

