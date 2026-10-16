import { generateToolMetadata } from "../../../lib/generate-tool-page";
import AndroidSignCertClient from "./AndroidSignCertClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("android-sign-cert");

export default function AndroidSignCertPage() {
  return <AndroidSignCertClient />;
}
