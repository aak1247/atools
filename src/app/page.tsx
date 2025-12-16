import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "../i18n/locales";

export default function Home() {
  redirect(`/${DEFAULT_LOCALE}`);
}
