import { generateToolMetadata } from "../../../lib/generate-tool-page";
import Aes256Client from "./Aes256Client";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("aes256");

export default function Aes256Page() {
  return <Aes256Client />;
}
