import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CorsCheckerClient from "./CorsCheckerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("cors-checker");

export default function CorsCheckerPage() {
  return <CorsCheckerClient />;
}

