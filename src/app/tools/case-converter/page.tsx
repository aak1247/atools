import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CaseConverterClient from "./CaseConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("case-converter");

export default function CaseConverterPage() {
  return <CaseConverterClient />;
}
