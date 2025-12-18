import { generateToolMetadata } from "../../../lib/generate-tool-page";
import FileEncryptorClient from "./FileEncryptorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("file-encryptor");

export default function FileEncryptorPage() {
  return <FileEncryptorClient />;
}

