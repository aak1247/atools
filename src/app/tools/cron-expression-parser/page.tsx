import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CronExpressionParserClient from "./CronExpressionParserClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("cron-expression-parser");

export default function CronExpressionParserPage() {
  return <CronExpressionParserClient />;
}