/**
 * 快捷键管理模块
 * 管理全局快捷键配置和绑定
 */

import logger from '../utils/DebugLogger.js';

const STORAGE_KEY = 'bilibili_shortcuts_config';

// 检测操作系统
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/**
 * 快捷键配置辅助函数
 * 简化快捷键配置，自动填充默认值
 * @param {string} key - 按键代码（如 'KeyB', 'Period', 'Slash'）
 * @param {Object} options - 配置选项
 * @param {boolean} options.cmd - 是否需要 Cmd/Ctrl 键（跨平台）
 * @param {boolean} options.alt - 是否需要 Alt 键
 * @param {boolean} options.shift - 是否需要 Shift 键
 * @param {boolean} options.doubleClickMode - 是否是双击模式
 * @param {boolean} options.holdMode - 是否是长按模式
 * @param {string} options.description - 快捷键描述
 * @returns {Object} 规范化的快捷键配置
 */
function createShortcut(key, { cmd = false, alt = false, shift = false, doubleClickMode = false, holdMode = false, description }) {
  return {
    key,
    meta: cmd,      // Mac Command 键
    ctrl: cmd,      // Windows Ctrl 键（会根据平台自动处理）
    alt,
    shift,
    doubleClickMode,
    holdMode,
    description
  };
}

// 默认快捷键配置
// 使用 createShortcut 简化配置，自动处理跨平台修饰键
const DEFAULT_SHORTCUTS = {
  // 字幕和笔记
  toggleSubtitlePanel: createShortcut('KeyB', { cmd: true, description: '切换字幕面板' }),
  toggleNotesPanel: createShortcut('Slash', { shift: true, description: '切换笔记面板' }),
  takeScreenshot: createShortcut('Slash', { cmd: true, description: '截图并保存到笔记' }),
  
  // 播放速度控制
  speedIncrease: createShortcut('Period', { description: '增加播放速度' }),
  speedDecrease: createShortcut('Comma', { description: '减少播放速度' }),
  speedReset: createShortcut('Comma', { doubleClickMode: true, description: '重置播放速度(双击)' }),
  speedDouble: createShortcut('Period', { doubleClickMode: true, description: '2倍速(双击)' }),
  
  // Option 键加速（长按临时加速，双击永久加速）
  speedBoost: createShortcut('AltRight', { holdMode: true, description: '长按临时加速/双击永久加速' }),
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
   * 规范化快捷键配置
   * 确保所有必需的属性都存在
   */
  normalizeShortcut(shortcut) {
    return {
      ...shortcut,
      meta: shortcut.meta || false,
      ctrl: shortcut.ctrl || false,
      alt: shortcut.alt || false,
      shift: shortcut.shift || false,
      doubleClickMode: shortcut.doubleClickMode || false,
      holdMode: shortcut.holdMode || false,
    };
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
          merged[key] = this.normalizeShortcut(shortcut);
        } else {
          logger.warn('ShortcutManager', `跳过损坏的快捷键配置: ${key}，使用默认值`);
        }
      }
      
      return merged;
    } catch (error) {
      logger.error('ShortcutManager', '加载快捷键配置失败，使用默认配置', error);
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
      const doubleClickMatch = (shortcut.doubleClickMode || false) === (config.doubleClickMode || false);
      const holdModeMatch = (shortcut.holdMode || false) === (config.holdMode || false);
      
      // 比较修饰键（支持跨平台）
      const metaMatch = (shortcut.meta || false) === (config.meta || false);
      const ctrlMatch = (shortcut.ctrl || false) === (config.ctrl || false);
      
      if (keyMatch && metaMatch && ctrlMatch && altMatch && shiftMatch && doubleClickMatch && holdModeMatch) {
        return shortcut.description;
      }
    }
    return null;
  }

  /**
   * 注册快捷键处理器
   * @param {string} name - 快捷键名称
   * @param {Function|Object} handler - 处理器函数，或包含 press/release 方法的对象
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
      // 检查按键是否匹配（支持特殊键如 AltRight）
      const keyMatches = event.code === shortcut.key || 
                        (shortcut.key === 'AltRight' && event.code === 'AltRight' && event.location === 2);
      
      if (!keyMatches) continue;

      // 处理长按模式（支持按下和双击）
      if (shortcut.holdMode) {
        event.preventDefault();
        
        // 检测双击
        const now = Date.now();
        if (!this.lastKeyPressTime) {
          this.lastKeyPressTime = {};
        }
        const lastPress = this.lastKeyPressTime[shortcut.key] || 0;
        const timeDiff = now - lastPress;
        
        const handler = this.handlers.get(name);
        if (handler) {
          // 双击检测（300ms内）
          if (timeDiff < 300) {
            // 双击：调用 doubleClick 方法（如果存在）
            if (typeof handler.doubleClick === 'function') {
              handler.doubleClick(event);
            }
            this.lastKeyPressTime[shortcut.key] = 0; // 重置
          } else {
            // 单次按下：调用 press 方法或直接调用函数
            if (typeof handler.press === 'function') {
              handler.press(event);
            } else if (typeof handler === 'function') {
              handler(event);
            }
            this.lastKeyPressTime[shortcut.key] = now;
          }
        }
        continue;
      }

      // 处理双击模式（统一处理）
      if (shortcut.doubleClickMode) {
        this.handleDoubleClick(event, name, shortcut);
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
          if (typeof handler === 'function') {
            handler(event);
          }
        }
      }
    }
  }

  /**
   * 处理键盘松开事件（用于长按模式）
   */
  handleKeyUp(event) {
    for (const [name, shortcut] of Object.entries(this.shortcuts)) {
      // 检查按键是否匹配（支持特殊键如 AltRight）
      const keyMatches = event.code === shortcut.key || 
                        (shortcut.key === 'AltRight' && event.code === 'AltRight' && event.location === 2);
      
      // 处理长按模式的松开
      if (shortcut.holdMode && keyMatches) {
        const handler = this.handlers.get(name);
        // 调用处理器的 release 方法（如果存在）
        if (handler && typeof handler.release === 'function') {
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

