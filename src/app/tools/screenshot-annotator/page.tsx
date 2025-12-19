import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ScreenshotAnnotatorClient from "./ScreenshotAnnotatorClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("screenshot-annotator");

export default function ScreenshotAnnotatorPage() {
  return <ScreenshotAnnotatorClient />;
}

