import { generateToolMetadata } from "../../../lib/generate-tool-page";
import SqlFormatterClient from "./SqlFormatterClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("sql-formatter");

export default function SqlFormatterPage() {
  return <SqlFormatterClient />;
}

