import { generateToolMetadata } from "../../../lib/generate-tool-page";
import NoiseMeterClient from "./NoiseMeterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("noise-meter");

export default function NoiseMeterPage() {
  return <NoiseMeterClient />;
}
