/**
 * 快捷键配置模态框模块
 * 提供快捷键自定义界面
 */

import shortcutManager from '../config/ShortcutManager.js';
import notification from './Notification.js';

class ShortcutConfigModal {
  constructor() {
    this.modal = null;
    this.isCapturing = false;
    this.currentCapturingField = null;
  }

  /**
   * 创建快捷键配置模态框
   */
  createModal() {
    if (this.modal) {
      return this.modal;
    }

    this.modal = document.createElement('div');
    this.modal.id = 'shortcut-config-modal';
    this.modal.className = 'config-modal';
    
    document.body.appendChild(this.modal);
    return this.modal;
  }

  /**
   * 显示模态框
   */
  show() {
    const modal = this.createModal();
    this.renderModal();
    modal.classList.add('show');
  }

  /**
   * 隐藏模态框
   */
  hide() {
    if (this.modal) {
      this.modal.classList.remove('show');
    }
    this.isCapturing = false;
    this.currentCapturingField = null;
  }

  /**
   * 渲染模态框内容
   */
  renderModal() {
    const shortcuts = shortcutManager.getAllShortcuts();

    this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>快捷键设置</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">使用说明</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              点击快捷键输入框，然后按下你想要的按键组合。支持 Ctrl/Cmd、Alt、Shift 修饰键。
            </div>
          </div>
          
          <div class="shortcut-list">
            ${Object.entries(shortcuts).map(([name, config]) => 
              this.renderShortcutItem(name, config)
            ).join('')}
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="shortcut-reset-btn">重置默认</button>
          <button class="config-btn config-btn-secondary" id="shortcut-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="shortcut-save-btn">保存</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * 渲染单个快捷键项
   */
  renderShortcutItem(name, config) {
    const displayText = shortcutManager.formatShortcut(config);
    
    return `
      <div class="shortcut-item">
        <div class="shortcut-label">${config.description}</div>
        <div class="shortcut-input-wrapper">
          <input type="text" 
                 class="shortcut-input" 
                 data-shortcut-name="${name}"
                 value="${displayText}" 
                 readonly
                 placeholder="点击设置快捷键">
          <button class="shortcut-clear-btn" data-shortcut-name="${name}" title="清除">×</button>
        </div>
      </div>
    `;
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 点击背景关闭
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // 快捷键输入框点击事件
    const inputs = this.modal.querySelectorAll('.shortcut-input');
    inputs.forEach(input => {
      input.addEventListener('click', () => {
        this.startCapture(input);
      });
    });

    // 清除按钮
    const clearButtons = this.modal.querySelectorAll('.shortcut-clear-btn');
    clearButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.getAttribute('data-shortcut-name');
        const input = this.modal.querySelector(`input[data-shortcut-name="${name}"]`);
        if (input) {
          input.value = '';
        }
      });
    });

    // 保存按钮
    document.getElementById('shortcut-save-btn')?.addEventListener('click', () => {
      this.saveShortcuts();
    });

    // 取消按钮
    document.getElementById('shortcut-cancel-btn')?.addEventListener('click', () => {
      this.hide();
    });

    // 重置按钮
    document.getElementById('shortcut-reset-btn')?.addEventListener('click', () => {
      if (confirm('确定要重置为默认快捷键吗？')) {
        const result = shortcutManager.resetToDefaults();
        if (result.success) {
          notification.success('已重置为默认快捷键');
          this.renderModal();
        } else {
          notification.error('重置失败');
        }
      }
    });
  }

  /**
   * 开始捕获快捷键
   */
  startCapture(input) {
    if (this.currentCapturingField) {
      this.currentCapturingField.classList.remove('capturing');
    }

    this.isCapturing = true;
    this.currentCapturingField = input;
    input.classList.add('capturing');
    input.value = '请按下快捷键...';

    const keydownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 忽略单独的修饰键
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
        return;
      }

      // 构建快捷键配置
      const config = {
        key: e.code || e.key,
        ctrl: e.ctrlKey || e.metaKey,
        alt: e.altKey,
        shift: e.shiftKey,
        doubleClick: false
      };

      // 显示快捷键
      const displayText = this.formatCapturedKey(config);
      input.value = displayText;

      // 清理
      input.classList.remove('capturing');
      this.isCapturing = false;
      this.currentCapturingField = null;
      document.removeEventListener('keydown', keydownHandler, true);
    };

    document.addEventListener('keydown', keydownHandler, true);

    // 失焦时取消捕获
    input.addEventListener('blur', () => {
      if (this.isCapturing && this.currentCapturingField === input) {
        input.classList.remove('capturing');
        this.isCapturing = false;
        this.currentCapturingField = null;
        document.removeEventListener('keydown', keydownHandler, true);
        
        // 恢复原值
        const name = input.getAttribute('data-shortcut-name');
        const shortcut = shortcutManager.getAllShortcuts()[name];
        if (shortcut) {
          input.value = shortcutManager.formatShortcut(shortcut);
        }
      }
    }, { once: true });
  }

  /**
   * 格式化捕获的按键
   */
  formatCapturedKey(config) {
    const parts = [];
    
    if (config.ctrl) {
      parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl');
    }
    if (config.alt) {
      parts.push('Alt');
    }
    if (config.shift) {
      parts.push('Shift');
    }
    
    let keyName = config.key;
    if (keyName === 'Period') keyName = '.';
    if (keyName === 'Comma') keyName = ',';
    if (keyName.length === 1) keyName = keyName.toUpperCase();
    
    parts.push(keyName);
    
    return parts.join(' + ');
  }

  /**
   * 保存所有快捷键
   */
  saveShortcuts() {
    const inputs = this.modal.querySelectorAll('.shortcut-input');
    const newShortcuts = {};

    for (const input of inputs) {
      const name = input.getAttribute('data-shortcut-name');
      const value = input.value.trim();

      if (!value || value === '请按下快捷键...') {
        notification.error(`请为"${shortcutManager.getAllShortcuts()[name].description}"设置快捷键`);
        return;
      }

      // 解析快捷键
      const config = this.parseShortcutString(value);
      if (!config) {
        notification.error(`快捷键"${value}"格式错误`);
        return;
      }

      // 保留原有的description和doubleClick设置
      const originalConfig = shortcutManager.getAllShortcuts()[name];
      newShortcuts[name] = {
        ...config,
        description: originalConfig.description,
        doubleClick: originalConfig.doubleClick || false
      };
    }

    // 检查冲突
    const conflicts = this.findConflicts(newShortcuts);
    if (conflicts.length > 0) {
      notification.error(`快捷键冲突: ${conflicts.join(', ')}`);
      return;
    }

    // 保存
    const result = shortcutManager.saveShortcuts(newShortcuts);
    if (result.success) {
      notification.success('快捷键已保存');
      setTimeout(() => this.hide(), 1000);
    } else {
      notification.error(`保存失败: ${result.error}`);
    }
  }

  /**
   * 解析快捷键字符串
   */
  parseShortcutString(str) {
    const parts = str.split('+').map(p => p.trim());
    
    const config = {
      key: '',
      ctrl: false,
      alt: false,
      shift: false
    };

    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower === 'ctrl' || lower === 'cmd') {
        config.ctrl = true;
      } else if (lower === 'alt') {
        config.alt = true;
      } else if (lower === 'shift') {
        config.shift = true;
      } else {
        // 这是按键
        if (part === '.') {
          config.key = 'Period';
        } else if (part === ',') {
          config.key = 'Comma';
        } else if (part.length === 1) {
          config.key = part.toLowerCase();
        } else {
          config.key = part;
        }
      }
    }

    if (!config.key) {
      return null;
    }

    return config;
  }

  /**
   * 查找所有冲突
   */
  findConflicts(shortcuts) {
    const conflicts = [];
    const keys = Object.keys(shortcuts);

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const name1 = keys[i];
        const name2 = keys[j];
        const sc1 = shortcuts[name1];
        const sc2 = shortcuts[name2];

        if (sc1.key === sc2.key &&
            sc1.ctrl === sc2.ctrl &&
            sc1.alt === sc2.alt &&
            sc1.shift === sc2.shift &&
            sc1.doubleClick === sc2.doubleClick) {
          conflicts.push(`${sc1.description} 与 ${sc2.description}`);
        }
      }
    }

    return conflicts;
  }
}

// 创建全局单例
export const shortcutConfigModal = new ShortcutConfigModal();
export default shortcutConfigModal;

