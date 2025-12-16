import { generateToolMetadata } from "../../../lib/generate-tool-page";
import GzipDeflateToolClient from "./GzipDeflateToolClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("gzip-deflate-tool");

export default function GzipDeflateToolPage() {
  return <GzipDeflateToolClient />;
}

