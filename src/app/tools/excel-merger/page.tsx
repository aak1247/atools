import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ExcelMergerClient from "./ExcelMergerClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("excel-merger");

export default function ExcelMergerPage() {
  return <ExcelMergerClient />;
}

