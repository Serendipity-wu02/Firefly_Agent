import { useTranslation } from "../../../i18n";
import "./BrowserNewTab.css";

/** Fixed starting points. Brand names are not translated, and no favicon is fetched: letters keep this page offline. */
export const BROWSER_START_SITES: readonly { title: string; url: string }[] = Object.freeze([
  { title: "Bing", url: "https://www.bing.com/" },
  { title: "百度", url: "https://www.baidu.com/" },
  { title: "GitHub", url: "https://github.com/" },
  { title: "维基百科", url: "https://zh.wikipedia.org/" },
  { title: "哔哩哔哩", url: "https://www.bilibili.com/" },
]);

const MAX_RECENT = 8;
const recentHosts = new Map<string, string>();
/** Window-lifetime memory only: never written to disk, cleared when the window's renderer reloads. */
export function rememberVisitedSite(committedUrl: string): void {
  try {
    const url = new URL(committedUrl);
    if (url.protocol !== "https:") return;
    recentHosts.delete(url.hostname);
    recentHosts.set(url.hostname, `${url.origin}/`);
    while (recentHosts.size > MAX_RECENT) recentHosts.delete(recentHosts.keys().next().value as string);
  } catch { /* an unparseable address is simply not remembered */ }
}
export function recentSites(): { title: string; url: string }[] {
  return [...recentHosts.entries()].reverse().map(([title, url]) => ({ title, url }));
}
export function clearRecentSites(): void { recentHosts.clear(); }

function Tile({ title, url, onOpen }: { title: string; url: string; onOpen(url: string): void }) {
  const letter = [...title.replace(/^www\./, "")][0]?.toUpperCase() ?? "?";
  return <button type="button" className="cy-browser-newtab__tile" data-browser-site={url} title={url} onClick={() => onOpen(url)}>
    <span className="cy-browser-newtab__icon" aria-hidden="true">{letter}</span>
    <span className="cy-browser-newtab__name">{title}</span>
  </button>;
}

/** Shown in place of a page. Opening a site goes through the same address path as typing it. */
export function BrowserNewTab({ onOpen, available = true }: { onOpen(url: string): void; available?: boolean }) {
  const { t } = useTranslation();
  const recent = recentSites();
  return <div className="cy-browser-newtab" data-browser-newtab data-disabled={!available || undefined}>
    {recent.length > 0 && <section aria-label={t("browserWorkspace.newTabRecent")}>
      <h3>{t("browserWorkspace.newTabRecent")}</h3>
      <div className="cy-browser-newtab__row">{recent.map(site => <Tile key={site.url} {...site} onOpen={onOpen} />)}</div>
    </section>}
    <section aria-label={t("browserWorkspace.newTabSites")}>
      <h3>{t("browserWorkspace.newTabSites")}</h3>
      <div className="cy-browser-newtab__row">{BROWSER_START_SITES.map(site => <Tile key={site.url} {...site} onOpen={onOpen} />)}</div>
    </section>
    <p className="cy-browser-newtab__hint">{t("browserWorkspace.newTabLocalHint")}</p>
  </div>;
}
