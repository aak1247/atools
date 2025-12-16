import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToGoStructClient from "./JsonToGoStructClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-go-struct");

export default function JsonToGoStructPage() {
  return <JsonToGoStructClient />;
}

