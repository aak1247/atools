import { generateToolMetadata } from "../../../lib/generate-tool-page";
import EscapeToolClient from "./EscapeToolClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("escape-tool");

export default function EscapeToolPage() {
  return <EscapeToolClient />;
}
