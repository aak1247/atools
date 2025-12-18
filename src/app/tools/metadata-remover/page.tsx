import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MetadataRemoverClient from "./MetadataRemoverClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("metadata-remover");

export default function MetadataRemoverPage() {
  return <MetadataRemoverClient />;
}

