import { generateToolMetadata } from "../../../lib/generate-tool-page";
import TimerClient from "./TimerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("timer");

export default function TimerPage() {
  return <TimerClient />;
}
