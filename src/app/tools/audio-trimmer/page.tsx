import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AudioTrimmerClient from "./AudioTrimmerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("audio-trimmer");

export default function AudioTrimmerPage() {
  return <AudioTrimmerClient />;
}
