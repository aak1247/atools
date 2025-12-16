import { generateToolMetadata } from "../../../lib/generate-tool-page";
import HttpHeaderParserClient from "./HttpHeaderParserClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("http-header-parser");

export default function HttpHeaderParserPage() {
  return <HttpHeaderParserClient />;
}

