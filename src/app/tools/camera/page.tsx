import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CameraClient from "./CameraClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("camera");

export default function CameraPage() {
  return <CameraClient />;
}
