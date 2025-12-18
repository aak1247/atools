import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AudioNoiseReducerClient from "./AudioNoiseReducerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("audio-noise-reducer");

export default function AudioNoiseReducerPage() {
  return <AudioNoiseReducerClient />;
}

