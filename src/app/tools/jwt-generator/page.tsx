import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JwtGeneratorClient from "./JwtGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("jwt-generator");

export default function JwtGeneratorPage() {
  return <JwtGeneratorClient />;
}

