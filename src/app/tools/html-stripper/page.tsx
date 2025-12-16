import { generateToolMetadata } from "../../../lib/generate-tool-page";
import HtmlStripperClient from "./HtmlStripperClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("html-stripper");

export default function HtmlStripperPage() {
  return <HtmlStripperClient />;
}
