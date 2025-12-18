import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MediaMetadataViewerClient from "./MediaMetadataViewerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("media-metadata-viewer");

export default function MediaMetadataViewerPage() {
  return <MediaMetadataViewerClient />;
}

