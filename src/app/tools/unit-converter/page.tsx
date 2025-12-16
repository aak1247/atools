import { generateToolMetadata } from "../../../lib/generate-tool-page";
import UnitConverterClient from "./UnitConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("unit-converter");

export default function UnitConverterPage() {
  return <UnitConverterClient />;
}
