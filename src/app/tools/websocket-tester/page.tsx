import { generateToolMetadata } from "../../../lib/generate-tool-page";
import WebsocketTesterClient from "./WebsocketTesterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("websocket-tester");

export default function WebsocketTesterPage() {
  return <WebsocketTesterClient />;
}
