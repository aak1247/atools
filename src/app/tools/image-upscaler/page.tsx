import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ImageUpscalerClient from "./ImageUpscalerClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("image-upscaler");

export default function ImageUpscalerPage() {
  return <ImageUpscalerClient />;
}

