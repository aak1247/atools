import { generateToolMetadata } from "../../../lib/generate-tool-page";
import TextDiffClient from "./TextDiffClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("text-diff");

export default function TextDiffPage() {
  return <TextDiffClient />;
}
