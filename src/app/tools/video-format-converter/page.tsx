import { generateToolMetadata } from "../../../lib/generate-tool-page";
import VideoFormatConverterClient from "./VideoFormatConverterClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("video-format-converter");

export default function VideoFormatConverterPage() {
  return <VideoFormatConverterClient />;
}

