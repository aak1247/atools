import { generateToolMetadata } from "../../../lib/generate-tool-page";
import TimestampConverterClient from "./TimestampConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("timestamp-converter");

export default function TimestampConverterPage() {
  return <TimestampConverterClient />;
}
