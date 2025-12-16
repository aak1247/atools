import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SealExtractorClient from "./SealExtractorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("seal-extractor");

export default function SealExtractorPage() {
  return <SealExtractorClient />;
}
