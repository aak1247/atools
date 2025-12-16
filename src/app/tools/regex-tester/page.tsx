import { generateToolMetadata } from "../../../lib/generate-tool-page";
import RegexTesterClient from "./RegexTesterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("regex-tester");

export default function RegexTesterPage() {
  return <RegexTesterClient />;
}
