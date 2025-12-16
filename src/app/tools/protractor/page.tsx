import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ProtractorClient from "./ProtractorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("protractor");

export default function ProtractorPage() {
  return <ProtractorClient />;
}
