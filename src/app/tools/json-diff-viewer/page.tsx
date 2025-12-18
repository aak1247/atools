import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonDiffViewerClient from "./JsonDiffViewerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-diff-viewer");

export default function JsonDiffViewerPage() {
  return <JsonDiffViewerClient />;
}

