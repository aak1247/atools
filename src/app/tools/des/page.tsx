import { generateToolMetadata } from "../../../lib/generate-tool-page";
import DesClient from "./DesClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("des");

export default function DesPage() {
  return <DesClient />;
}
