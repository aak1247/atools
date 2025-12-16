import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MusicPlayerClient from "./MusicPlayerClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("music-player");

export default function MusicPlayerPage() {
  return <MusicPlayerClient />;
}
