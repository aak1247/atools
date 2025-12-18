import { generateToolMetadata } from "../../../lib/generate-tool-page";
import X509CertificateViewerClient from "./X509CertificateViewerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("x509-certificate-viewer");

export default function X509CertificateViewerPage() {
  return <X509CertificateViewerClient />;
}

