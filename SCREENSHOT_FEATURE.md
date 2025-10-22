# 视频截图功能说明

## 功能概述

新增视频截图功能，可以快速截取当前视频帧并保存到笔记，B站视频支持自动同步到Notion。

## 快捷键

**Ctrl/Cmd + S** - 截取当前视频帧

## 功能特性

### 1. 本地笔记保存
- ✅ 自动截取当前视频帧（PNG格式）
- ✅ 保存时间戳和视频标题
- ✅ 图片以Base64格式存储在本地笔记中
- ✅ 在笔记面板中可查看截图缩略图

### 2. Notion自动同步（B站视频）
当满足以下条件时，截图会自动发送到Notion：
- ✅ 当前是B站视频页面
- ✅ 已配置Notion API
- ✅ 视频有字幕数据

同步内容包括：
- 📸 截图标题（含时间戳）
- 🖼️ 截图图片
- ⏱️ 视频时间点

### 3. 图片处理
- **分辨率**：使用视频原始分辨率
- **格式**：PNG（质量95%）
- **大小提示**：图片超过1MB时会提示

## 使用方法

### 基本使用
1. 播放视频到想要截图的位置
2. 按 **Ctrl/Cmd + S**
3. 截图自动保存到笔记
4. 在"笔记管理"中查看

### Notion同步
1. 配置Notion API（菜单 → Notion配置）
2. 播放B站视频（需要有字幕）
3. 按 **Ctrl/Cmd + S** 截图
4. 自动上传到Notion并追加到对应页面

## 技术实现

### 核心技术
- **OffscreenCanvas**：高性能截图
- **Blob处理**：图片转换和存储
- **Base64编码**：本地存储优化

### 关键文件
- `src/services/ScreenshotService.js` - 截图服务核心逻辑
- `src/services/NotesService.js` - 笔记存储（支持多种类型）
- `src/ui/NotesPanel.js` - 笔记UI显示
- `src/config/ShortcutManager.js` - 快捷键配置

### 数据结构
```javascript
{
  id: "唯一ID",
  content: "[截图] MM:SS",
  type: "screenshot",
  timestamp: 1234567890,
  timeString: "MM:SS",
  imageData: "data:image/png;base64,...",
  videoTitle: "视频标题",
  url: "视频URL"
}
```

## 注意事项

### 1. Notion图片限制
- Notion API要求图片必须是可访问的URL
- 当前使用Base64 data URL作为临时方案
- 大图片（>1MB）可能在Notion中显示受限

### 2. 存储空间
- Base64图片会占用LocalStorage空间
- 建议定期清理旧截图
- 未来可考虑添加图片压缩功能

### 3. 浏览器兼容性
- 需要支持OffscreenCanvas API
- Chrome 69+, Firefox 105+, Safari 16.4+

## 未来改进方向

1. **图床集成**
   - 支持上传到图床服务（如imgur、sm.ms）
   - 获得永久URL，优化Notion显示

2. **图片压缩**
   - 可选图片质量和尺寸
   - 减少存储空间占用

3. **批量截图**
   - 支持连续截图
   - 导出为PDF或ZIP

4. **截图标注**
   - 添加文字标注
   - 画笔工具

5. **OCR识别**
   - 识别截图中的文字
   - 自动提取字幕内容
