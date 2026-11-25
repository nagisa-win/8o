/**
 * 只给「设备舱工具模式」做一次预编译：它依赖 @yume-chan/adb 系列包，
 * 其余页面仍然是零依赖的静态 ESM。产物落在 dist/lab/assets/vendor/。
 */
import { defineConfig } from "vite";

export default defineConfig({
  configFile: false,
  logLevel: "warn",
  build: {
    outDir: "dist/lab/assets/vendor",
    emptyOutDir: false,
    target: "es2022",
    minify: "esbuild",
    lib: {
      entry: "sites/lab/src/advanced-device.js",
      formats: ["es"],
      fileName: () => "advanced-device.js",
    },
  },
});
