import { generateToolMetadata } from "../../../lib/generate-tool-page";
import VideoCompressorClient from "./VideoCompressorClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("video-compressor");

export default function VideoCompressorPage() {
  return <VideoCompressorClient />;
}

