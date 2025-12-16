import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ImageConverterClient from "./ImageConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("image-converter");

export default function ImageConverterPage() {
  return <ImageConverterClient />;
}
