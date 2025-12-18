import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CsvVisualizerClient from "./CsvVisualizerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("csv-visualizer");

export default function CsvVisualizerPage() {
  return <CsvVisualizerClient />;
}

