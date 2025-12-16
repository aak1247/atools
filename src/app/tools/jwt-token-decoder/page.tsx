import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JwtTokenDecoderClient from "./JwtTokenDecoderClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("jwt-token-decoder");

export default function JwtTokenDecoderPage() {
  return <JwtTokenDecoderClient />;
}

