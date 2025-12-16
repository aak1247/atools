import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ExcelToJsonClient from "./ExcelToJsonClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("excel-to-json");

export default function ExcelToJsonPage() {
  return <ExcelToJsonClient />;
}

