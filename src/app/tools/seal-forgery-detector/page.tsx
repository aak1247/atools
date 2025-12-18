import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SealForgeryDetectorClient from "./SealForgeryDetectorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("seal-forgery-detector");

export default function SealForgeryDetectorPage() {
  return <SealForgeryDetectorClient />;
}

