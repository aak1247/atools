import { generateToolMetadata } from "../../../lib/generate-tool-page";
import XmindViewerClient from "./XmindViewerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("xmind-viewer");

export default function XmindViewerPage() {
  return <XmindViewerClient />;
}
