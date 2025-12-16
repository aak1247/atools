import { generateToolMetadata } from "../../../lib/generate-tool-page";
import TimezoneConverterClient from "./TimezoneConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("timezone-converter");

export default function TimezoneConverterPage() {
  return <TimezoneConverterClient />;
}

