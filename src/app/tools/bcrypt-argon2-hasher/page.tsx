import { generateToolMetadata } from "../../../lib/generate-tool-page";
import BcryptArgon2HasherClient from "./BcryptArgon2HasherClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("bcrypt-argon2-hasher");

export default function BcryptArgon2HasherPage() {
  return <BcryptArgon2HasherClient />;
}

