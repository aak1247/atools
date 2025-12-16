import { generateToolMetadata } from "../../../lib/generate-tool-page";
import GifToVideoClient from "./GifToVideoClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("gif-to-video");

export default function GifToVideoPage() {
  return <GifToVideoClient />;
}
