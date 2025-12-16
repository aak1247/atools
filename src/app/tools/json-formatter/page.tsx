import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonFormatterClient from "./JsonFormatterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-formatter");

export default function JsonFormatterPage() {
  return <JsonFormatterClient />;
}
