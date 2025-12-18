import { generateToolMetadata } from "../../../lib/generate-tool-page";
import EmojiPickerClient from "./EmojiPickerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("emoji-picker");

export default function EmojiPickerPage() {
  return <EmojiPickerClient />;
}

