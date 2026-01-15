import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ToolPageLayout from "../../../components/ToolPageLayout";
import XmindViewerClient from "./XmindViewerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("xmind-viewer");

export default function XmindViewerPage() {
  return (
    <ToolPageLayout toolSlug="xmind-viewer" maxWidthClassName="max-w-6xl">
      <XmindViewerClient />
    </ToolPageLayout>
  );
}
