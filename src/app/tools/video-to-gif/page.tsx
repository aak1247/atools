import { generateToolMetadata } from "../../../lib/generate-tool-page";
import VideoToGifClient from "./VideoToGifClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("video-to-gif");

export default function VideoToGifPage() {
  return <VideoToGifClient />;
}
