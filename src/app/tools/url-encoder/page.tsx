import { generateToolMetadata } from "../../../lib/generate-tool-page";
import UrlEncoderClient from "./UrlEncoderClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("url-encoder");

export default function UrlEncoderPage() {
  return <UrlEncoderClient />;
}
