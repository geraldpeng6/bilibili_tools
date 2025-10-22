# 版本管理指南

## 版本号规则

本项目采用语义化版本号 (Semantic Versioning)：`主版本号.次版本号.补丁版本号`

- **主版本号 (Major)**: 重大功能更新或不兼容的 API 修改
- **次版本号 (Minor)**: 新增功能，向下兼容
- **补丁版本号 (Patch)**: Bug 修复和小改进

## 版本更新命令

### 快速更新（推荐）
```bash
npm run bump
```
自动增加补丁版本号并构建项目（例如：1.0.1 → 1.0.2）

### 指定版本类型
```bash
npm run version:patch  # 补丁版本 x.x.1 → x.x.2
npm run version:minor  # 次版本 x.1.x → x.2.0  
npm run version:major  # 主版本 1.x.x → 2.0.0
```

## 自动化功能

1. **自动构建**: 版本更新后自动执行构建
2. **版本历史**: 自动生成 `VERSION_HISTORY.md` 记录
3. **Git Hook 提醒**: 提交代码时自动提醒更新版本号
4. **同步更新**: 自动同步 `package.json` 和 `vite.config.js` 中的版本号

## 工作流程

1. 完成代码修改
2. 运行 `npm run bump` 更新版本
3. 在 `VERSION_HISTORY.md` 中填写更新说明
4. 提交代码：
   ```bash
   git add .
   git commit -m "feat: 功能说明 (v1.0.x)"
   ```

## 版本更新规则

- ✅ **每次代码更新都要增加版本号**
- ✅ Bug 修复使用 patch 版本
- ✅ 新功能使用 minor 版本
- ✅ 重大更新使用 major 版本
- ✅ 提交前检查版本号是否更新

## 文件说明

- `scripts/bump-version.js` - 版本更新脚本
- `VERSION_HISTORY.md` - 版本历史记录
- `.husky/pre-commit` - Git Hook 脚本
