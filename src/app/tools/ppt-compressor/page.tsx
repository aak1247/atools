import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PptCompressorClient from "./PptCompressorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("ppt-compressor");

export default function PptCompressorPage() {
  return <PptCompressorClient />;
}

