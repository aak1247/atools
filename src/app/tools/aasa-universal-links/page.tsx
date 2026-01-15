import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AasaUniversalLinksClient from "./AasaUniversalLinksClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("aasa-universal-links");

export default function AasaUniversalLinksPage() {
  return <AasaUniversalLinksClient />;
}

