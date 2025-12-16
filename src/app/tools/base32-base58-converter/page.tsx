import { generateToolMetadata } from "../../../lib/generate-tool-page";
import Base32Base58ConverterClient from "./Base32Base58ConverterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("base32-base58-converter");

export default function Base32Base58ConverterPage() {
  return <Base32Base58ConverterClient />;
}

