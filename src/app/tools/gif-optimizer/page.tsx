import { generateToolMetadata } from "../../../lib/generate-tool-page";
import GifOptimizerClient from "./GifOptimizerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("gif-optimizer");

export default function GifOptimizerPage() {
  return <GifOptimizerClient />;
}

