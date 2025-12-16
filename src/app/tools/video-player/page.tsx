import { generateToolMetadata } from "../../../lib/generate-tool-page";
import VideoPlayerClient from "./VideoPlayerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("video-player");

export default function VideoPlayerPage() {
  return <VideoPlayerClient />;
}
