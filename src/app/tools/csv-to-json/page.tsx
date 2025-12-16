import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CsvToJsonClient from "./CsvToJsonClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("csv-to-json");

export default function CsvToJsonPage() {
  return <CsvToJsonClient />;
}
