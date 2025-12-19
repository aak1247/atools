import { generateToolMetadata } from "../../../lib/generate-tool-page";
import IdPhotoProcessorClient from "./IdPhotoProcessorClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("id-photo-processor");

export default function IdPhotoProcessorPage() {
  return <IdPhotoProcessorClient />;
}

