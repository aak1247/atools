import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CurlToCodeClient from "./CurlToCodeClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("curl-to-code");

export default function CurlToCodePage() {
  return <CurlToCodeClient />;
}

