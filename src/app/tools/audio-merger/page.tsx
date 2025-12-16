import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AudioMergerClient from "./AudioMergerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("audio-merger");

export default function AudioMergerPage() {
  return <AudioMergerClient />;
}
