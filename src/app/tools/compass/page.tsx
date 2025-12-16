import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CompassClient from "./CompassClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("compass");

export default function CompassPage() {
  return <CompassClient />;
}
