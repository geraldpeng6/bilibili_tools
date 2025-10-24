# Bilibili Tools - AI开发助手指南

## 🎯 核心原则

### 1. 源代码修改
- ✅ **只修改** `src/` 目录下的文件
- ❌ **禁止修改** `dist/` 目录（自动生成的构建产物）

### 2. 版本管理（重要）
**每次修改代码后必须执行：**

```bash
npm run bump
```

这个命令会自动：
1. 版本号 +0.0.1（如 v1.0.11 → v1.0.12）
2. 更新 `package.json` 和 `vite.config.js`
3. 在 `VERSION_HISTORY.md` 顶部添加新版本记录
4. 自动构建 `dist/bilibili_tools.user.js`

**然后必须填写更新说明：**
- 打开 `VERSION_HISTORY.md`
- 将 `[待填写更新说明]` 替换为具体的更新内容
- 格式参考历史记录，使用清晰的中文描述

### 3. 代码规范
- **注释**：所有函数必须使用中文注释
- **命名**：驼峰命名（函数/变量），帕斯卡命名（类）
- **模块化**：使用 ES6 import/export
- **日志**：使用 `logger.debug/info/warn/error`，不用 `console.log`

## 📁 项目结构

```
src/                    # ← 修改这里
├── main.js            # 主入口
├── constants.js       # 常量
├── services/          # 业务逻辑（AI、Notion、字幕等）
├── ui/                # UI组件
├── config/            # 配置管理
├── state/             # 状态管理
└── utils/             # 工具函数

dist/                   # ← 勿修改（自动生成）
└── bilibili_tools.user.js

VERSION_HISTORY.md      # 版本更新记录
```

## 🔄 开发流程

1. **修改代码** → 在 `src/` 下修改
2. **更新版本** → 运行 `npm run bump`
3. **填写说明** → 编辑 `VERSION_HISTORY.md` 顶部
4. **提交代码** → pre-commit钩子会自动构建

## 💡 常用命令

```bash
npm run build       # 手动构建
npm run dev         # 开发模式（监听变化）
npm run bump        # 版本更新+构建（推荐使用）
```

## 🎨 核心功能模块

| 模块 | 文件位置 | 说明 |
|------|---------|------|
| 字幕提取 | `services/SubtitleService.js` | 自动提取B站字幕 |
| AI总结 | `services/AIService.js` | 支持多AI服务商 |
| Notion集成 | `services/NotionService.js` | 发送笔记到Notion |
| 笔记管理 | `services/NotesService.js` | 文字和截图笔记 |
| 截图功能 | `services/ScreenshotService.js` | 视频截图保存 |
| 播放控制 | `services/SpeedControlService.js` | 快捷键控制播放 |
| UI渲染 | `ui/UIRenderer.js` | 界面渲染 |
| 事件处理 | `ui/EventHandlers.js` | 用户交互 |

## ⚙️ 配置说明

- **AI配置**：支持 OpenAI、DeepSeek、通义千问等
- **Notion配置**：需要 API Key 和 Database/Page ID
- **快捷键**：可自定义所有快捷键
- **调试模式**：油猴菜单 → 🔧 调试模式

## 📝 开发提示

1. **日志使用**
```javascript
import logger from '../utils/DebugLogger.js';

logger.debug('模块名', '调试信息');  // 调试模式显示
logger.info('模块名', '重要信息');   // 始终显示
logger.warn('模块名', '警告信息');   // 警告
logger.error('模块名', '错误信息');  // 错误
```

2. **Notion API**
```javascript
// Markdown转Notion blocks
const blocks = this._convertMarkdownToNotionBlocks(markdown);

// 支持的格式：# 标题、**粗体**、- 列表、> 引用等
```

3. **状态管理**
```javascript
import state from '../state/StateManager.js';

state.getVideoInfo();      // 获取视频信息
state.getSubtitleData();   // 获取字幕数据
state.getAISummary();      // 获取AI总结
```

## ✅ AI助手检查清单

修改代码前确认：
- [ ] 理解用户需求
- [ ] 确定需要修改的 `src/` 文件
- [ ] 保持代码风格一致

修改代码后确认：
- [ ] 运行 `npm run bump`
- [ ] 编辑 `VERSION_HISTORY.md` 填写更新说明
- [ ] 确保构建成功（无错误）
- [ ] 验证功能正常
