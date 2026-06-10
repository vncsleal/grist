const GITHUB_RELEASES = "https://github.com/vncsleal/quillby/releases/latest/download";

export const DOWNLOAD_URLS = {
  macosPkg: `${GITHUB_RELEASES}/quillby-macos.pkg`,
  macosDmg: `${GITHUB_RELEASES}/quillby-macos.dmg`,
  windowsExe: `${GITHUB_RELEASES}/quillby-windows.exe`,
  releasesPage: "https://github.com/vncsleal/quillby/releases",
} as const;
