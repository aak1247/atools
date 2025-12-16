import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonCompareClient from "./JsonCompareClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-compare");

export default function JsonComparePage() {
  return <JsonCompareClient />;
}

