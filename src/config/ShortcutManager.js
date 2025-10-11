/**
 * 快捷键管理模块
 * 管理全局快捷键配置和绑定
 */

const STORAGE_KEY = 'bilibili_shortcuts_config';

// 默认快捷键配置
const DEFAULT_SHORTCUTS = {
  toggleSubtitlePanel: { key: 'b', ctrl: true, alt: false, shift: false, description: '切换字幕面板' },
  toggleNotesPanel: { key: 'l', ctrl: true, alt: false, shift: false, description: '切换笔记面板' },
  saveNote: { key: 's', ctrl: true, alt: false, shift: false, description: '保存选中文本为笔记' },
  speedIncrease: { key: 'Period', ctrl: false, alt: false, shift: false, description: '增加播放速度' },
  speedDecrease: { key: 'Comma', ctrl: false, alt: false, shift: false, description: '减少播放速度' },
  speedReset: { key: 'Comma', ctrl: false, alt: false, shift: false, doubleClick: true, description: '重置播放速度(双击)' },
  speedDouble: { key: 'Period', ctrl: false, alt: false, shift: false, doubleClick: true, description: '2倍速(双击)' },
};

class ShortcutManager {
  constructor() {
    this.shortcuts = this.loadShortcuts();
    this.handlers = new Map();
    this.isListening = false;
  }

  /**
   * 加载快捷键配置
   */
  loadShortcuts() {
    try {
      const saved = GM_getValue(STORAGE_KEY, null);
      return saved ? JSON.parse(saved) : { ...DEFAULT_SHORTCUTS };
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
   * 检查快捷键冲突
   */
  checkConflict(excludeName, config) {
    for (const [name, shortcut] of Object.entries(this.shortcuts)) {
      if (name === excludeName) continue;

      if (shortcut.key === config.key &&
          shortcut.ctrl === config.ctrl &&
          shortcut.alt === config.alt &&
          shortcut.shift === config.shift &&
          shortcut.doubleClick === config.doubleClick) {
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
   * 检查事件是否匹配快捷键
   */
  matches(event, shortcut) {
    const ctrlPressed = event.ctrlKey || event.metaKey;
    
    return event.code === shortcut.key &&
           ctrlPressed === shortcut.ctrl &&
           event.altKey === shortcut.alt &&
           event.shiftKey === shortcut.shift;
  }

  /**
   * 开始监听快捷键
   */
  startListening() {
    if (this.isListening) return;

    document.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
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
      // 跳过双击类型的快捷键（由SpeedControlService处理）
      if (shortcut.doubleClick) continue;

      // 全局快捷键（Ctrl/Cmd组合键）允许在任何地方触发
      const isGlobalShortcut = shortcut.ctrl || shortcut.alt;
      
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
   * 格式化快捷键为显示文本
   */
  formatShortcut(shortcut) {
    const parts = [];
    
    if (shortcut.ctrl) {
      parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl');
    }
    if (shortcut.alt) {
      parts.push('Alt');
    }
    if (shortcut.shift) {
      parts.push('Shift');
    }
    
    // 格式化按键名
    let keyName = shortcut.key;
    if (keyName === 'Period') keyName = '.';
    if (keyName === 'Comma') keyName = ',';
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

