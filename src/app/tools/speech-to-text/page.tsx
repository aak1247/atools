import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SpeechToTextClient from "./SpeechToTextClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("speech-to-text");

export default function SpeechToTextPage() {
  return <SpeechToTextClient />;
}
