import { generateToolMetadata } from "../../../lib/generate-tool-page";
import BaseConverterClient from "./BaseConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("base-converter");

export default function BaseConverterPage() {
  return <BaseConverterClient />;
}
