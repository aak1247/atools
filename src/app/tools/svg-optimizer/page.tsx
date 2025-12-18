import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SvgOptimizerClient from "./SvgOptimizerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("svg-optimizer");

export default function SvgOptimizerPage() {
  return <SvgOptimizerClient />;
}

