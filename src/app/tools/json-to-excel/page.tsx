import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToExcelClient from "./JsonToExcelClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-excel");

export default function JsonToExcelPage() {
  return <JsonToExcelClient />;
}

