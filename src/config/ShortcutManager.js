/**
 * 快捷键管理模块
 * 管理全局快捷键配置和绑定
 */

import logger from '../utils/DebugLogger.js';

const STORAGE_KEY = 'bilibili_shortcuts_config';

// 检测操作系统
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

// 默认快捷键配置
// 注意：meta 字段表示 Mac Command 键，ctrl 字段表示 Windows Ctrl 键
// 在 matches() 方法中会自动根据操作系统进行转换
const DEFAULT_SHORTCUTS = {
  toggleSubtitlePanel: { key: 'KeyB', meta: true, ctrl: true, alt: false, shift: false, description: '切换字幕面板' },
  toggleNotesPanel: { key: 'Slash', meta: false, ctrl: false, alt: false, shift: true, description: '切换笔记面板' },
  takeScreenshot: { key: 'Slash', meta: true, ctrl: true, alt: false, shift: false, description: '截图并保存到笔记' },
  speedIncrease: { key: 'Period', meta: false, ctrl: false, alt: false, shift: false, description: '增加播放速度' },
  speedDecrease: { key: 'Comma', meta: false, ctrl: false, alt: false, shift: false, description: '减少播放速度' },
  speedReset: { key: 'Comma', meta: false, ctrl: false, alt: false, shift: false, doubleClick: true, description: '重置播放速度(双击)' },
  speedDouble: { key: 'Period', meta: false, ctrl: false, alt: false, shift: false, doubleClick: true, description: '2倍速(双击)' },
};

// 快捷键说明：
// toggleSubtitlePanel: Cmd+B (Mac) 或 Ctrl+B (Windows)
// toggleNotesPanel: Shift+/ (所有平台)
// takeScreenshot: Cmd+/ (Mac) 或 Ctrl+/ (Windows)

class ShortcutManager {
  constructor() {
    this.shortcuts = this.loadShortcuts();
    this.handlers = new Map();
    this.isListening = false;
    this.pressedKeys = new Set();
    this.setupKeyTracking();
  }

  // 静态属性，用于访问默认快捷键配置
  static get DEFAULT_SHORTCUTS() {
    return DEFAULT_SHORTCUTS;
  }

  /**
   * 加载快捷键配置
   */
  loadShortcuts() {
    try {
      const saved = GM_getValue(STORAGE_KEY, null);
      if (!saved) {
        return { ...DEFAULT_SHORTCUTS };
      }
      
      const shortcuts = JSON.parse(saved);
      
      // 合并默认配置（确保新增的快捷键也会显示）
      const merged = { ...DEFAULT_SHORTCUTS };
      for (const [key, shortcut] of Object.entries(shortcuts)) {
        if (shortcut.key && shortcut.key !== '(双击)' && shortcut.key !== '') {
          merged[key] = shortcut;
        } else {
          logger.warn('ShortcutManager', `修复损坏的快捷键配置: ${key}`);
          if (DEFAULT_SHORTCUTS[key]) {
            merged[key] = { ...DEFAULT_SHORTCUTS[key] };
          }
        }
      }
      
      return merged;
    } catch (error) {
      console.error('加载快捷键配置失败:', error);
      return { ...DEFAULT_SHORTCUTS };
    }
  }

  /**
   * 保存快捷键配置
   */
  saveShortcuts(shortcuts) {
    try {
      this.shortcuts = shortcuts;
      GM_setValue(STORAGE_KEY, JSON.stringify(shortcuts));
      return { success: true, error: null };
    } catch (error) {
      console.error('保存快捷键配置失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 重置为默认快捷键
   */
  resetToDefaults() {
    this.shortcuts = { ...DEFAULT_SHORTCUTS };
    return this.saveShortcuts(this.shortcuts);
  }

  /**
   * 获取所有快捷键
   */
  getAllShortcuts() {
    return { ...this.shortcuts };
  }

  /**
   * 更新单个快捷键
   */
  updateShortcut(name, config) {
    if (!this.shortcuts[name]) {
      return { success: false, error: '快捷键不存在' };
    }

    // 检查冲突
    const conflict = this.checkConflict(name, config);
    if (conflict) {
      return { success: false, error: `与"${conflict}"冲突` };
    }

    this.shortcuts[name] = { ...this.shortcuts[name], ...config };
    return this.saveShortcuts(this.shortcuts);
  }

  /**
   * 检查快捷键冲突（支持跨平台）
   */
  checkConflict(excludeName, config) {
    for (const [name, shortcut] of Object.entries(this.shortcuts)) {
      if (name === excludeName) continue;

      // 比较快捷键是否相同
      const keyMatch = shortcut.key === config.key;
      const altMatch = shortcut.alt === config.alt;
      const shiftMatch = shortcut.shift === config.shift;
      const doubleClickMatch = shortcut.doubleClick === config.doubleClick;
      
      // 比较修饰键（支持跨平台）
      const metaMatch = (shortcut.meta || false) === (config.meta || false);
      const ctrlMatch = (shortcut.ctrl || false) === (config.ctrl || false);
      
      if (keyMatch && metaMatch && ctrlMatch && altMatch && shiftMatch && doubleClickMatch) {
        return shortcut.description;
      }
    }
    return null;
  }

  /**
   * 注册快捷键处理器
   */
  register(name, handler) {
    this.handlers.set(name, handler);
  }

  /**
   * 设置按键跟踪
   */
  setupKeyTracking() {
    // 跟踪按下的键
    document.addEventListener('keydown', (e) => {
      this.pressedKeys.add(e.code);
    }, true);
    
    // 清除释放的键
    document.addEventListener('keyup', (e) => {
      this.pressedKeys.delete(e.code);
    }, true);
    
    // 窗口失焦时清空
    window.addEventListener('blur', () => {
      this.pressedKeys.clear();
    });
  }

  /**
   * 检查事件是否匹配快捷键
   * 支持 Mac (Command) 和 Windows (Ctrl) 跨平台
   */
  matches(event, shortcut) {
    // 处理组合键（多键同时按下）
    if (shortcut.keys && Array.isArray(shortcut.keys)) {
      // 检查所有指定的键是否都被按下
      const allPressed = shortcut.keys.every(key => this.pressedKeys.has(key));
      // 确保没有修饰键
      const noModifiers = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      return allPressed && noModifiers;
    }
    
    // 处理传统快捷键（支持跨平台）
    // Mac: 使用 meta 字段（Command 键）
    // Windows: 使用 ctrl 字段（Ctrl 键）
    const cmdPressed = IS_MAC ? event.metaKey : event.ctrlKey;
    const expectedCmd = IS_MAC ? (shortcut.meta || false) : (shortcut.ctrl || false);
    
    return event.code === shortcut.key &&
           cmdPressed === expectedCmd &&
           event.altKey === (shortcut.alt || false) &&
           event.shiftKey === (shortcut.shift || false);
  }

  /**
   * 开始监听快捷键
   */
  startListening() {
    if (this.isListening) return;

    document.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
    document.addEventListener('keyup', (e) => this.handleKeyUp(e), true);
    this.isListening = true;
  }

  /**
   * 处理键盘事件
   */
  handleKeyDown(event) {
    // 忽略在输入框中的按键（除了特定的全局快捷键）
    const isInputField = event.target.tagName === 'INPUT' || 
                        event.target.tagName === 'TEXTAREA' || 
                        event.target.isContentEditable;

    for (const [name, shortcut] of Object.entries(this.shortcuts)) {
      // 处理长按模式
      if (shortcut.holdMode) {
        if (event.code === shortcut.key) {
          const handler = this.handlers.get(name);
          if (handler) {
            event.preventDefault();
            handler(event);
          }
        }
        continue;
      }

      // 处理双击模式
      if (shortcut.doubleClickMode) {
        if (event.code === shortcut.key) {
          this.handleDoubleClick(event, name, shortcut);
        }
        continue;
      }

      // 处理旧的doubleClick类型的快捷键
      if (shortcut.doubleClick) {
        // 截图快捷键特殊处理
        if (name === 'takeScreenshot') {
          this.handleDoubleClick(event, name, shortcut);
        }
        // 其他双击快捷键由SpeedControlService处理
        continue;
      }

      // 全局快捷键（Ctrl/Cmd组合键）允许在任何地方触发
      const isGlobalShortcut = shortcut.ctrl || shortcut.alt || shortcut.meta;
      
      if (this.matches(event, shortcut)) {
        // 如果是输入框且不是全局快捷键，跳过
        if (isInputField && !isGlobalShortcut) {
          continue;
        }

        const handler = this.handlers.get(name);
        if (handler) {
          event.preventDefault();
          handler(event);
        }
      }
    }
  }

  /**
   * 处理键盘松开事件（用于长按模式）
   */
  handleKeyUp(event) {
    for (const [name, shortcut] of Object.entries(this.shortcuts)) {
      // 处理长按模式的松开
      if (shortcut.holdMode && event.code === shortcut.key) {
        // 调用处理器的 release 方法（如果存在）
        const handler = this.handlers.get(name);
        if (handler && handler.release) {
          event.preventDefault();
          handler.release(event);
        }
      }
    }
  }

  /**
   * 处理双击快捷键
   */
  handleDoubleClick(event, name, shortcut) {
    if (event.code !== shortcut.key) return;
    
    const now = Date.now();
    if (!this.lastKeyPressTime) {
      this.lastKeyPressTime = {};
    }
    
    const lastPress = this.lastKeyPressTime[shortcut.key] || 0;
    const timeDiff = now - lastPress;
    
    if (timeDiff < 300) { // 300ms内连按两次
      const handler = this.handlers.get(name);
      if (handler) {
        event.preventDefault();
        handler(event);
        this.lastKeyPressTime[shortcut.key] = 0; // 重置
      }
    } else {
      this.lastKeyPressTime[shortcut.key] = now;
    }
  }

  /**
   * 格式化快捷键为显示文本（支持跨平台、长按、双击）
   */
  formatShortcut(shortcut) {
    // 处理组合键
    if (shortcut.keys && Array.isArray(shortcut.keys)) {
      const keyNames = shortcut.keys.map(key => {
        if (key === 'Period') return '.';
        if (key === 'Comma') return ',';
        if (key.length === 1) return key.toUpperCase();
        return key;
      });
      return keyNames.join(' + ');
    }
    
    // 处理长按模式
    if (shortcut.holdMode) {
      let keyName = shortcut.key;
      if (keyName === 'Period') keyName = '.';
      if (keyName === 'Comma') keyName = ',';
      if (keyName === 'Slash') keyName = '/';
      if (keyName.startsWith('Key')) keyName = keyName.substring(3);
      if (keyName.length === 1) keyName = keyName.toUpperCase();
      return `${keyName} (长按)`;
    }
    
    // 处理双击模式
    if (shortcut.doubleClickMode) {
      let keyName = shortcut.key;
      if (keyName === 'Period') keyName = '.';
      if (keyName === 'Comma') keyName = ',';
      if (keyName === 'Slash') keyName = '/';
      if (keyName.startsWith('Key')) keyName = keyName.substring(3);
      if (keyName.length === 1) keyName = keyName.toUpperCase();
      return `${keyName} (双击)`;
    }
    
    // 处理传统快捷键（支持跨平台）
    const parts = [];
    
    // 根据操作系统显示对应的修饰键
    if (IS_MAC && shortcut.meta) {
      parts.push('Cmd');
    } else if (!IS_MAC && shortcut.ctrl) {
      parts.push('Ctrl');
    }
    
    if (shortcut.alt) {
      parts.push(IS_MAC ? 'Option' : 'Alt');
    }
    if (shortcut.shift) {
      parts.push('Shift');
    }
    
    // 格式化按键名
    let keyName = shortcut.key;
    if (keyName === 'Period') keyName = '.';
    if (keyName === 'Comma') keyName = ',';
    if (keyName === 'Slash') keyName = '/';
    if (keyName.startsWith('Key')) keyName = keyName.substring(3);
    if (keyName.length === 1) keyName = keyName.toUpperCase();
    
    parts.push(keyName);
    
    if (shortcut.doubleClick) {
      parts.push('(双击)');
    }
    
    return parts.join(' + ');
  }

  /**
   * 验证快捷键配置
   */
  validateConfig(config) {
    if (!config.key || typeof config.key !== 'string') {
      return { valid: false, error: '按键不能为空' };
    }

    if (typeof config.ctrl !== 'boolean' ||
        typeof config.alt !== 'boolean' ||
        typeof config.shift !== 'boolean') {
      return { valid: false, error: '修饰键配置错误' };
    }

    return { valid: true, error: null };
  }
}

// 创建全局单例
export const shortcutManager = new ShortcutManager();
export default shortcutManager;

