import { Preferences } from "@capacitor/preferences";
import type { MobileStore, MobileUser } from "./types";

const SESSION_KEY = "session.v1";

export type Session = { token: string; user: MobileUser; store: MobileStore };

export async function readSession(): Promise<Session | null> {
  const { value } = await Preferences.get({ key: SESSION_KEY });
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Session;
    return parsed.token && parsed.user && parsed.store ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeSession(session: Session) {
  await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
}

export async function clearSession() {
  await Preferences.remove({ key: SESSION_KEY });
}