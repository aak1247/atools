import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SslCheckerClient from "./SslCheckerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("ssl-checker");

export default function SslCheckerPage() {
  return <SslCheckerClient />;
}

