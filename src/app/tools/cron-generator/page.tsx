import { generateToolMetadata } from "../../../lib/generate-tool-page";
import CronGeneratorClient from "./CronGeneratorClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("cron-generator");

export default function CronGeneratorPage() {
  return <CronGeneratorClient />;
}

