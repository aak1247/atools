import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToCsharpClassClient from "./JsonToCsharpClassClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-csharp-class");

export default function JsonToCsharpClassPage() {
  return <JsonToCsharpClassClient />;
}

