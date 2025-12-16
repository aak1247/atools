import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CalculatorClient from "./CalculatorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("calculator");

export default function CalculatorPage() {
  return <CalculatorClient />;
}
