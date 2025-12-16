import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToTypeScriptClient from "./JsonToTypeScriptClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-typescript");

export default function JsonToTypeScriptPage() {
  return <JsonToTypeScriptClient />;
}

