import { generateToolMetadata } from "../../../lib/generate-tool-page";
import PasswordStrengthCheckerClient from "./PasswordStrengthCheckerClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("password-strength-checker");

export default function PasswordStrengthCheckerPage() {
  return <PasswordStrengthCheckerClient />;
}