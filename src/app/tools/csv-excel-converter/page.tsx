import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CsvExcelConverterClient from "./CsvExcelConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("csv-excel-converter");

export default function CsvExcelConverterPage() {
  return <CsvExcelConverterClient />;
}
