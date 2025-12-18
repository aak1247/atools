import { generateToolMetadata } from "../../../lib/generate-tool-page";
import ContractVersionDiffClient from "./ContractVersionDiffClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("contract-version-diff");

export default function ContractVersionDiffPage() {
  return <ContractVersionDiffClient />;
}

