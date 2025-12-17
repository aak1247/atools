import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PemJwkToolkitClient from "./PemJwkToolkitClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("pem-jwk-toolkit");

export default function PemJwkToolkitPage() {
  return <PemJwkToolkitClient />;
}

