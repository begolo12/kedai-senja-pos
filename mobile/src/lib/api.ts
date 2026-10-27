import type { MobileUser, PendingOrder, Snapshot, SyncResult } from "./types";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO ?? "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(
        typeof body.error === "string" ? body.error : "Server tidak merespons.",
        response.status,
      );
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export function login(username: string, pin: string) {
  return request<{ token: string; user: MobileUser }>("/api/mobile/login", {
    method: "POST",
    body: JSON.stringify({ username, pin }),
  });
}

export type SyncResponse = Snapshot & {
  user: MobileUser;
  results: SyncResult[];
};

export function sync(token: string, orders: PendingOrder[]) {
  return request<SyncResponse>("/api/mobile/sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      orders: orders.map((order) => ({
        clientId: order.clientId,
        items: order.items,
        discountType: order.discountType,
        discountValue: order.discountValue,
        taxRate: order.taxRate,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        taxAmount: order.taxAmount,
        total: order.total,
        costTotal: order.costTotal,
        paymentMethod: order.paymentMethod,
        amountPaid: order.amountPaid,
        changeDue: order.changeDue,
        orderType: order.orderType,
        tableLabel: order.tableLabel,
        createdAt: order.createdAt,
        note: order.note,
      })),
    }),
  });
}

export async function fetchLatestRelease() {
  if (!GITHUB_REPO) return null;
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    { headers: { accept: "application/vnd.github+json" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Gagal memeriksa pembaruan.");
  return (await response.json()) as {
    tag_name: string;
    html_url: string;
    assets: { name: string; browser_download_url: string; size: number }[];
  };
}