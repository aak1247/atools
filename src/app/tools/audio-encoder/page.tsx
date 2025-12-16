import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AudioEncoderClient from "./AudioEncoderClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("audio-encoder");

export default function AudioEncoderPage() {
  return <AudioEncoderClient />;
}
