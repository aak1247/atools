import { generateToolMetadata } from "../../../lib/generate-tool-page";
import WordCompressorClient from "./WordCompressorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("word-compressor");

export default function WordCompressorPage() {
  return <WordCompressorClient />;
}

