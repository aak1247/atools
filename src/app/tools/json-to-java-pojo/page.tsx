import { generateToolMetadata } from "../../../lib/generate-tool-page";
import JsonToJavaPojoClient from "./JsonToJavaPojoClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("json-to-java-pojo");

export default function JsonToJavaPojoPage() {
  return <JsonToJavaPojoClient />;
}

