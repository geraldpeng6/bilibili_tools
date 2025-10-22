# Bilibili Tools - 开发助手指南

## 项目概述
**Bilibili Tools** 是一个功能强大的油猴脚本项目，集成六大功能：
- 字幕提取与AI总结
- Notion集成
- 笔记管理
- 播放速度控制
- SponsorBlock广告跳过
- 自定义快捷键

## 项目结构
```
bilibili_tools/
├── src/                    # 源代码目录（修改这里）
│   ├── main.js            # 主入口文件
│   ├── constants.js       # 常量定义
│   ├── state/             # 状态管理
│   ├── services/          # 业务服务层
│   ├── ui/                # UI组件和渲染
│   ├── config/            # 配置管理
│   └── utils/             # 工具函数
├── dist/                  # 构建产物目录（勿手动修改）
│   └── bilibili_tools.user.js
├── package.json           # 项目配置
├── vite.config.js         # 构建配置
└── README.md              # 项目说明
```

## 开发规则

### 🔧 开发规范
- **代码组织**：采用模块化开发，使用ES6 import/export
- **注释要求**：所有函数、类、复杂逻辑必须使用中文注释
- **命名规范**：变量和函数使用驼峰命名，类使用帕斯卡命名

### 🏗️ 构建流程
```bash
# 开发模式（监听文件变化自动构建）
npm run dev

# 生产构建（提交前自动运行）
npm run build

# 预览构建产物
npm run preview
```

### ⚠️ 重要提醒
1. **永远不要直接修改 `dist/` 目录下的文件**
   - 构建产物由 `src/` 目录自动生成
   - 修改源代码后运行 `npm run build` 重新构建

2. **提交代码时会自动触发构建**
   - pre-commit钩子会自动构建并将产物加入暂存区
   - 确保开发时在 `src/` 下进行所有修改

3. **依赖管理**
   - 外部依赖：`marked`（markdown解析）
   - 构建工具：`vite` + `vite-plugin-monkey`

### 📝 代码示例
```javascript
/**
 * 解析markdown文本
 * @param {string} markdownText - markdown文本
 * @returns {string} 解析后的HTML
 */
parseMarkdown(markdownText) {
  // 检查marked库是否可用
  if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
    try {
      return marked.parse(markdownText);
    } catch (error) {
      console.warn('Marked解析失败:', error);
    }
  }
  // 回退处理...
}
```

## 功能模块说明
- **字幕服务**：自动提取B站视频字幕，支持AI总结
- **笔记系统**：选中文字保存，分类管理
- **播放控制**：键盘快捷键控制播放速度
- **广告过滤**：集成SponsorBlock跳过广告
- **AI集成**：支持多种AI服务商（OpenAI、DeepSeek等）
- **Notion同步**：一键发送内容到Notion数据库

## 开发助手职责
1. 始终在 `src/` 目录下修改源代码
2. 修改后必须运行 `npm run build` 重新构建
3. 保持中文注释，使用清晰的函数和变量命名
4. 维护代码的模块化结构和可读性
