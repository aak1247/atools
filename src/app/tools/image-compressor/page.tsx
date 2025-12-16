import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ImageCompressorClient from "./ImageCompressorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("image-compressor");

export default function ImageCompressorPage() {
  return <ImageCompressorClient />;
}
