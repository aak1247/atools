import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CsvToYamlClient from "./CsvToYamlClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("csv-to-yaml");

export default function CsvToYamlPage() {
  return <CsvToYamlClient />;
}
