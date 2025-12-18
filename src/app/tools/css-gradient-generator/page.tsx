import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CssGradientGeneratorClient from "./CssGradientGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("css-gradient-generator");

export default function CssGradientGeneratorPage() {
  return <CssGradientGeneratorClient />;
}

