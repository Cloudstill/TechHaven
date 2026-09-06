// 构建产物体积预算检查（CI 在 vite build 之后执行）
//
// 预算对象：首屏主入口 index-*.js 的 gzip 体积。分包（路由 lazy + 依赖清理）之后，
// index 只含 vendor 与首屏依赖；超预算即失败，防止主包再次膨胀到整应用单体。
// 基线（2026-08-29，R0）：主入口 gzip 95.4 KB（未分包/清理前约 1.03 MB，见 ROADMAP R0）。
// 预算 256 KB 对当前基线留有 2.6 倍余量，任何把全应用打回单体的改动会被立即拦下。

import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const DIST = path.resolve("dist/assets");
const KB = 1024;

/** index-*.js（主入口 gzip）预算，单位 KB；可用环境变量 BUNDLE_INDEX_KB 覆盖 */
const INDEX_BUDGET_KB = Number(process.env.BUNDLE_INDEX_KB ?? 256);

function gzipSize(filePath) {
  return gzipSync(readFileSync(filePath)).length;
}

const files = readdirSync(DIST)
  .filter((f) => f.endsWith(".js"))
  .map((f) => {
    const full = path.join(DIST, f);
    return { name: f, sizeKb: statSync(full).size / KB, gzipKb: gzipSize(full) / KB };
  })
  .sort((a, b) => b.gzipKb - a.gzipKb);

console.log("dist/assets JS 产物体积（gzip）：");
for (const { name, sizeKb, gzipKb } of files) {
  console.log(`  ${gzipKb.toFixed(1).padStart(7)} KB  ${sizeKb.toFixed(1).padStart(7)} KB  ${name}`);
}

const main = files.find((f) => /^index-.*\.js$/.test(f.name));
if (!main) {
  console.error("未找到 index-*.js 主入口");
  process.exit(1);
}

console.log(`\n主入口 ${main.name} gzip: ${main.gzipKb.toFixed(1)} KB（预算 ${INDEX_BUDGET_KB} KB）`);
if (main.gzipKb > INDEX_BUDGET_KB) {
  console.error(`❌ 主入口超过体积预算 ${INDEX_BUDGET_KB} KB`);
  process.exit(1);
}
console.log("✅ 主入口体积在预算内");
