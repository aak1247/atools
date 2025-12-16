import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ImageCropperClient from "./ImageCropperClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("image-cropper");

export default function ImageCropperPage() {
  return <ImageCropperClient />;
}
