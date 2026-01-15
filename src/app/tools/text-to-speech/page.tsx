import { generateToolMetadata } from "../../../lib/generate-tool-page";
import TextToSpeechClient from "./TextToSpeechClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("text-to-speech");

export default function TextToSpeechPage() {
  return <TextToSpeechClient />;
}
