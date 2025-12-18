import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ZipEncryptorClient from "./ZipEncryptorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("zip-encryptor");

export default function ZipEncryptorPage() {
  return <ZipEncryptorClient />;
}

