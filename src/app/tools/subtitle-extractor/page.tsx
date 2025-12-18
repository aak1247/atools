import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SubtitleExtractorClient from "./SubtitleExtractorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("subtitle-extractor");

export default function SubtitleExtractorPage() {
  return <SubtitleExtractorClient />;
}

