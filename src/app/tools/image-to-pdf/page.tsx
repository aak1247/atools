import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ImageToPdfClient from "./ImageToPdfClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("image-to-pdf");

export default function ImageToPdfPage() {
  return <ImageToPdfClient />;
}

