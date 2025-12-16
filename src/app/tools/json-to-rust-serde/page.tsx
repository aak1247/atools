import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToRustSerdeClient from "./JsonToRustSerdeClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-rust-serde");

export default function JsonToRustSerdePage() {
  return <JsonToRustSerdeClient />;
}

