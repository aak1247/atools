const RECENT_TOOLS_STORAGE_KEY = "atools_recent_tools";
const MAX_RECENT_TOOLS = 6;

export function getRecentToolSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_TOOLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Ignore storage parse errors
  }
  return [];
}

export function recordRecentToolSlug(slug: string): void {
  if (typeof window === "undefined" || !slug) return;
  try {
    const current = getRecentToolSlugs().filter((s) => s !== slug);
    const updated = [slug, ...current].slice(0, MAX_RECENT_TOOLS);
    localStorage.setItem(RECENT_TOOLS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage write errors
  }
}
