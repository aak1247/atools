import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AudioSilenceTrimmerClient from "./AudioSilenceTrimmerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("audio-silence-trimmer");

export default function AudioSilenceTrimmerPage() {
  return <AudioSilenceTrimmerClient />;
}

