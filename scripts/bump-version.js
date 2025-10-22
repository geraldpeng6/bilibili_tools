#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 读取当前版本
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// 解析版本号
const [major, minor, patch] = currentVersion.split('.').map(Number);

// 根据参数决定增加哪个版本号
const bumpType = process.argv[2] || 'patch'; // 默认增加小版本号
let newVersion;

switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`📦 版本号更新: ${currentVersion} → ${newVersion}`);

// 更新 package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✅ 已更新 package.json');

// 更新 vite.config.js
const viteConfigPath = path.join(rootDir, 'vite.config.js');
let viteConfig = fs.readFileSync(viteConfigPath, 'utf8');

// 使用正则表达式替换版本号
viteConfig = viteConfig.replace(
  /version:\s*['"][\d.]+['"]/,
  `version: '${newVersion}'`
);

fs.writeFileSync(viteConfigPath, viteConfig);
console.log('✅ 已更新 vite.config.js');

// 获取当前日期
const now = new Date();
const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

// 更新或创建版本历史文件
const versionHistoryPath = path.join(rootDir, 'VERSION_HISTORY.md');
let versionHistory = '';

if (fs.existsSync(versionHistoryPath)) {
  versionHistory = fs.readFileSync(versionHistoryPath, 'utf8');
}

// 在文件开头添加新版本记录
const newEntry = `## v${newVersion} (${dateStr} ${timeStr})
- 更新时间: ${dateStr} ${timeStr}
- 更新类型: ${bumpType}
- 更新说明: [待填写更新说明]

---

`;

versionHistory = newEntry + versionHistory;
fs.writeFileSync(versionHistoryPath, versionHistory);
console.log('✅ 已更新 VERSION_HISTORY.md');

console.log(`\n🎉 版本更新完成！当前版本: v${newVersion}`);
console.log('📝 请在 VERSION_HISTORY.md 中填写更新说明');
