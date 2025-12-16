import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ImageResizerClient from "./ImageResizerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("image-resizer");

export default function ImageResizerPage() {
  return <ImageResizerClient />;
}
