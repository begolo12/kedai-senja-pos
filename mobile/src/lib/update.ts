import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";
import { GITHUB_REPO, fetchLatestRelease } from "./api";

export const APP_VERSION = __APP_VERSION__;

export type UpdateInfo = {
  version: string;
  url: string;
  size: number;
  fileName: string;
  releaseUrl: string;
};

function normalise(tag: string) {
  return tag.replace(/^mobile-v?/i, "").replace(/^v/i, "").trim();
}

export function isNewer(remote: string, local: string) {
  const a = normalise(remote).split(".").map(Number);
  const b = normalise(local).split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!GITHUB_REPO) return null;
  const release = await fetchLatestRelease();
  if (!release) return null;
  if (!isNewer(release.tag_name, APP_VERSION)) return null;
  const apk = release.assets.find((asset) => asset.name.endsWith(".apk"));
  if (!apk) return null;
  if (!apk.browser_download_url.startsWith("https://github.com/")) return null;
  return {
    version: normalise(release.tag_name),
    url: apk.browser_download_url,
    size: apk.size,
    fileName: apk.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
    releaseUrl: release.html_url,
  };
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function downloadAndInstall(
  update: UpdateInfo,
  onProgress?: (percent: number) => void,
) {
  if (!Capacitor.isNativePlatform()) {
    await Browser.open({ url: update.url });
    return;
  }

  onProgress?.(0);
  const response = await fetch(update.url);
  if (!response.ok) throw new Error("Unduhan gagal.");
  const total = Number(response.headers.get("content-length") ?? update.size);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Perangkat tidak mendukung unduhan.");

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(total ? Math.round((received / total) * 95) : 50);
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const written = await Filesystem.writeFile({
    path: update.fileName,
    data: toBase64(merged.buffer),
    directory: Directory.Cache,
  });
  const uri = await Filesystem.getUri({
    path: update.fileName,
    directory: Directory.Cache,
  });
  onProgress?.(100);
  await FileOpener.open({
    filePath: uri.uri || written.uri,
    contentType: "application/vnd.android.package-archive",
  });
}