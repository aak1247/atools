import { generateToolMetadata } from "../../../lib/generate-tool-page";
import HashToolsClient from "./HashToolsClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("hash-tools");

export default function HashToolsPage() {
  return <HashToolsClient />;
}
