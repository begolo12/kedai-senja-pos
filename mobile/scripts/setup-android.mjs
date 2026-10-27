import fs from "node:fs";
import path from "node:path";

const appId = "id.kedaisenja.pos";
const root = path.resolve("android");
if (!fs.existsSync(root)) {
  throw new Error("Jalankan `npx cap add android` dulu.");
}

const javaDir = path.join(root, "app/src/main/java", ...appId.split("."));
fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(
  "native/android/ThermalPrintPlugin.java",
  path.join(javaDir, "ThermalPrintPlugin.java"),
);
fs.writeFileSync(
  path.join(javaDir, "MainActivity.java"),
  `package ${appId};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThermalPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
);

const manifestPath = path.join(root, "app/src/main/AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
if (!manifest.includes("REQUEST_INSTALL_PACKAGES")) {
  manifest = manifest.replace(
    "<application",
    '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n\n    <application',
  );
  fs.writeFileSync(manifestPath, manifest);
}

const gradlePath = path.join(root, "app/build.gradle");
let gradle = fs.readFileSync(gradlePath, "utf8");
const code = process.env.BUILD_VERSION_CODE ?? "1";
const name = process.env.BUILD_VERSION_NAME ?? "1.0.0";
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${name}"`);
fs.writeFileSync(gradlePath, gradle);

console.log(`Android project prepared: version ${name} (${code})`);
