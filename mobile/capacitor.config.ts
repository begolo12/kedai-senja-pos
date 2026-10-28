import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "id.terapos.pos",
  appName: "Tera POS",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: { enabled: false },
  },
};

export default config;
