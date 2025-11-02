/**
 * 确认对话框工具
 * 提供统一的用户确认界面
 */

import logger from '../utils/DebugLogger.js';

/**
 * 显示确认对话框
 * @param {string} message - 提示信息
 * @param {Object} options - 配置选项
 * @param {string} options.title - 对话框标题
 * @param {string} options.confirmText - 确认按钮文字
 * @param {string} options.cancelText - 取消按钮文字
 * @param {string} options.type - 对话框类型 (info/warning/danger)
 * @returns {Promise<boolean>} - 用户选择：true=确认，false=取消
 */
export function showConfirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    const {
      title = '确认操作',
      confirmText = '确认',
      cancelText = '取消',
      type = 'info'
    } = options;

    logger.debug('ConfirmDialog', `显示确认对话框: ${message}`);

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      animation: fadeIn 0.2s ease-out;
    `;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 0;
      min-width: 320px;
      max-width: 480px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
    `;

    // 获取类型对应的颜色
    const typeColors = {
      info: '#1890ff',
      warning: '#faad14',
      danger: '#ff4d4f'
    };
    const typeColor = typeColors[type] || typeColors.info;

    // 创建标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #f0f0f0;
    `;
    header.innerHTML = `
      <h3 style="
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #262626;
      ">${title}</h3>
    `;

    // 创建内容区
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 24px;
      font-size: 14px;
      line-height: 1.6;
      color: #595959;
    `;
    content.textContent = message;

    // 创建按钮区
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 12px 16px;
      border-top: 1px solid #f0f0f0;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;

    // 取消按钮
    const cancelButton = document.createElement('button');
    cancelButton.textContent = cancelText;
    cancelButton.style.cssText = `
      padding: 6px 16px;
      border: 1px solid #d9d9d9;
      border-radius: 6px;
      background: white;
      color: #595959;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      outline: none;
    `;
    cancelButton.onmouseover = () => {
      cancelButton.style.borderColor = '#40a9ff';
      cancelButton.style.color = '#40a9ff';
    };
    cancelButton.onmouseout = () => {
      cancelButton.style.borderColor = '#d9d9d9';
      cancelButton.style.color = '#595959';
    };

    // 确认按钮
    const confirmButton = document.createElement('button');
    confirmButton.textContent = confirmText;
    confirmButton.style.cssText = `
      padding: 6px 16px;
      border: none;
      border-radius: 6px;
      background: ${typeColor};
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      outline: none;
    `;
    confirmButton.onmouseover = () => {
      confirmButton.style.opacity = '0.85';
    };
    confirmButton.onmouseout = () => {
      confirmButton.style.opacity = '1';
    };

    // 组装对话框
    footer.appendChild(cancelButton);
    footer.appendChild(confirmButton);
    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideIn {
        from {
          transform: translateY(-20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    // 关闭对话框的函数
    const closeDialog = (result) => {
      logger.debug('ConfirmDialog', `用户选择: ${result ? '确认' : '取消'}`);
      overlay.style.animation = 'fadeIn 0.2s ease-out reverse';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
        resolve(result);
      }, 200);
    };

    // 绑定事件
    cancelButton.onclick = () => closeDialog(false);
    confirmButton.onclick = () => closeDialog(true);
    
    // 点击遮罩层关闭（视为取消）
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closeDialog(false);
      }
    };

    // ESC键关闭（视为取消）
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEsc);
        closeDialog(false);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // 添加到页面
    document.body.appendChild(overlay);

    // 聚焦到确认按钮
    setTimeout(() => confirmButton.focus(), 100);
  });
}

/**
 * 显示信息确认对话框
 * @param {string} message - 提示信息
 * @param {string} title - 标题
 * @returns {Promise<boolean>}
 */
export function showInfoConfirm(message, title = '提示') {
  return showConfirmDialog(message, {
    title,
    type: 'info'
  });
}

/**
 * 显示警告确认对话框
 * @param {string} message - 提示信息
 * @param {string} title - 标题
 * @returns {Promise<boolean>}
 */
export function showWarningConfirm(message, title = '警告') {
  return showConfirmDialog(message, {
    title,
    type: 'warning'
  });
}

/**
 * 显示危险操作确认对话框
 * @param {string} message - 提示信息
 * @param {string} title - 标题
 * @returns {Promise<boolean>}
 */
export function showDangerConfirm(message, title = '危险操作') {
  return showConfirmDialog(message, {
    title,
    type: 'danger',
    confirmText: '确认执行',
    cancelText: '取消'
  });
}

export default {
  showConfirmDialog,
  showInfoConfirm,
  showWarningConfirm,
  showDangerConfirm
};

