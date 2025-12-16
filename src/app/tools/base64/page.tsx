import { generateToolMetadata } from "../../../lib/generate-tool-page";
import Base64Client from "./Base64Client";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("base64");

export default function Base64Page() {
  return <Base64Client />;
}

