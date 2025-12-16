import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SvgConverterClient from "./SvgConverterClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("svg-converter");

export default function SvgConverterPage() {
  return <SvgConverterClient />;
}