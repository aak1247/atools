import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AvTranscoderClient from "./AvTranscoderClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("av-transcoder");

export default function AvTranscoderPage() {
  return <AvTranscoderClient />;
}
