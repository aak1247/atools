import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AudioFormatConverterClient from "./AudioFormatConverterClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("audio-format-converter");

export default function AudioFormatConverterPage() {
  return <AudioFormatConverterClient />;
}

