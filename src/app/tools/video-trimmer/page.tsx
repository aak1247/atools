import { generateToolMetadata } from "../../../lib/generate-tool-page";
import VideoTrimmerClient from "./VideoTrimmerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("video-trimmer");

export default function VideoTrimmerPage() {
  return <VideoTrimmerClient />;
}
