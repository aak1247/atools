import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ApiTesterClient from "./ApiTesterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("api-tester");

export default function ApiTesterPage() {
  return <ApiTesterClient />;
}
