import { generateToolMetadata } from "../../../lib/generate-tool-page";
import WordCounterClient from "./WordCounterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("word-counter");

export default function WordCounterPage() {
  return <WordCounterClient />;
}
