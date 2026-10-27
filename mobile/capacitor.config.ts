import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "id.kedaisenja.pos",
  appName: "Kasir Senja",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: { enabled: false },
  },
};

export default config;
