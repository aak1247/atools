import type { Locale } from "./locales";

export type Messages = {
  siteName: string;
  navTools: string;
  navSitemap: string;
  navPrivacy: string;
  navAnalyticsSettings: string;
  navGithub: string;
  navReportIssue: string;
  footerTagline: string;
  homeBadge: string;
  homeTitlePrefix: string;
  homeTitleHighlight: string;
  homeDescription: string;
  searchPlaceholder: string;
  categoryAll: string;
  toolCardLocal: string;
  toolCardTry: string;
  moreToolsTitle: string;
  moreToolsDescription: string;
  emptyTitle: string;
  emptyDescription: string;
  clearFilters: string;
  toolLoadingTitle: string;
  toolLoadingDescription: string;
  editToolOnGithub: string;
  shareCurrentPage: string;
  sharing: string;
  linkCopied: string;
  installAsApp: string;
  iosInstallHint: string;
  browserInstallHint: string;
  clarityConsentTitle: string;
  clarityConsentDescription: string;
  clarityConsentAllow: string;
  clarityConsentDeny: string;
  clarityConsentClose: string;
};

const zhCN: Messages = {
  siteName: "纯粹工具站",
  navTools: "工具导航",
  navSitemap: "站点地图",
  navPrivacy: "隐私政策",
  navAnalyticsSettings: "统计设置",
  navReportIssue: "提交缺陷",
  navGithub: "GitHub",
  footerTagline: "Crafted with precision.",
  homeBadge: "纯前端 · 零上传 · 极致体验",
  homeTitlePrefix: "让工具回归",
  homeTitleHighlight: "简单与纯粹",
  homeDescription:
    "精心打造的纯前端工具集合。无需安装，即开即用，所有数据均在本地处理，为您提供最安全、流畅的使用体验。",
  searchPlaceholder: "搜索工具...",
  categoryAll: "全部",
  toolCardLocal: "本地运行",
  toolCardTry: "Try it",
  moreToolsTitle: "更多工具",
  moreToolsDescription: "持续更新中，敬请期待...",
  emptyTitle: "未找到相关工具",
  emptyDescription: "尝试更换关键字，或者切换到其他分类看看",
  clearFilters: "清除筛选",
  toolLoadingTitle: "工具加载中...",
  toolLoadingDescription: "正在加载工具信息...",
  editToolOnGithub: "查看源码 (GitHub)",
  shareCurrentPage: "分享当前页面",
  sharing: "分享中...",
  linkCopied: "链接已复制到剪贴板",
  installAsApp: "安装此页面为应用",
  iosInstallHint: "在 Safari 浏览器底部菜单中选择“分享”，然后点击“添加到主屏幕”即可安装此工具。",
  browserInstallHint: "可在浏览器地址栏右侧点击“安装”，或在菜单中选择“添加到主屏幕/安装应用”。",
  clarityConsentTitle: "分析偏好设置",
  clarityConsentDescription:
    "站点默认以 Microsoft Clarity 的无 Cookie 模式收集匿名页面使用数据，用于基础可用性分析。若你同意，我们会额外启用分析类 Cookie，把跨页访问串成更完整的热力图与会话回放；广告存储始终关闭，工具主交互区默认额外遮罩。",
  clarityConsentAllow: "允许完整分析",
  clarityConsentDeny: "仅保留匿名统计",
  clarityConsentClose: "关闭",
};

const enUS: Messages = {
  siteName: "Pure Tools",
  navTools: "Tools",
  navSitemap: "Sitemap",
  navPrivacy: "Privacy",
  navAnalyticsSettings: "Analytics settings",
  navReportIssue: "Report Issue",
  navGithub: "GitHub",
  footerTagline: "Crafted with precision.",
  homeBadge: "Pure frontend · No upload · Fast & private",
  homeTitlePrefix: "Make tools ",
  homeTitleHighlight: "simple and pure",
  homeDescription:
    "A carefully curated collection of fully in-browser tools. No installs. No uploads. Everything runs locally for privacy and speed.",
  searchPlaceholder: "Search tools...",
  categoryAll: "All",
  toolCardLocal: "Local-only",
  toolCardTry: "Try it",
  moreToolsTitle: "More tools",
  moreToolsDescription: "More coming soon...",
  emptyTitle: "No matching tools",
  emptyDescription: "Try different keywords or switch categories.",
  clearFilters: "Clear filters",
  toolLoadingTitle: "Loading tool...",
  toolLoadingDescription: "Loading tool info...",
  editToolOnGithub: "View source on GitHub",
  shareCurrentPage: "Share this page",
  sharing: "Sharing...",
  linkCopied: "Link copied to clipboard",
  installAsApp: "Install as app",
  iosInstallHint: "In Safari, tap Share, then choose “Add to Home Screen” to install this tool.",
  browserInstallHint: "You can install this app from your browser address bar or menu (Add to Home Screen / Install).",
  clarityConsentTitle: "Analytics preferences",
  clarityConsentDescription:
    "This site uses Microsoft Clarity in cookieless mode by default to collect anonymous page-usage data for baseline usability analysis. If you allow it, we additionally enable analytics cookies so cross-page visits can be stitched into fuller heatmaps and session replays; ad storage stays denied and tool interaction areas remain additionally masked.",
  clarityConsentAllow: "Allow full analytics",
  clarityConsentDeny: "Keep anonymous only",
  clarityConsentClose: "Close",
};

export const getMessages = (locale: Locale): Messages => {
  if (locale === "en-us") return enUS;
  return zhCN;
};
