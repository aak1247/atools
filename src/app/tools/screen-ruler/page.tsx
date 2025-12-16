import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ScreenRulerClient from "./ScreenRulerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("screen-ruler");

export default function ScreenRulerPage() {
  return <ScreenRulerClient />;
}

