import { generateToolMetadata } from "../../../lib/generate-tool-page";
import UrlParserClient from "./UrlParserClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("url-parser");

export default function UrlParserPage() {
  return <UrlParserClient />;
}

