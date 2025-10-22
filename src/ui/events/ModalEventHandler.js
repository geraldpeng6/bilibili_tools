/**
 * 模态框事件处理器
 * 统一管理所有模态框的显示、隐藏和事件绑定
 */

import modalManager from '../../utils/ModalManager.js';
import config from '../../config/ConfigManager.js';
import notification from '../Notification.js';
import logger from '../../utils/DebugLogger.js';

export class ModalEventHandler {
  constructor() {
    this.modals = new Map();
    this.activeModal = null;
  }

  /**
   * 注册模态框
   * @param {string} modalId - 模态框ID
   * @param {Object} modalConfig - 模态框配置
   */
  registerModal(modalId, modalConfig) {
    const defaultConfig = {
      onShow: () => {},
      onHide: () => {},
      onSave: () => {},
      loadData: () => {},
      validateData: () => true,
      escapeClose: true,
      backgroundClose: true
    };

    this.modals.set(modalId, {
      ...defaultConfig,
      ...modalConfig,
      proxy: {
        hide: () => this.hideModal(modalId)
      }
    });
  }

  /**
   * 显示模态框
   * @param {string} modalId
   */
  async showModal(modalId) {
    const modalConfig = this.modals.get(modalId);
    if (!modalConfig) {
      logger.error('ModalEventHandler', `Modal ${modalId} not registered`);
      return;
    }

    const modal = document.getElementById(modalId);
    if (!modal) {
      logger.error('ModalEventHandler', `Modal element ${modalId} not found`);
      return;
    }

    try {
      // 加载数据
      await modalConfig.loadData(modal);

      // 显示模态框
      modal.classList.add('show');
      this.activeModal = modalId;

      // 绑定事件
      this.bindModalEvents(modal, modalConfig);

      // 注册到模态框管理器
      modalManager.push(modalConfig.proxy);

      // 调用显示回调
      modalConfig.onShow(modal);

    } catch (error) {
      logger.error('ModalEventHandler', `Failed to show modal ${modalId}:`, error);
      notification.error(`打开${modalId}失败: ${error.message}`);
    }
  }

  /**
   * 隐藏模态框
   * @param {string} modalId
   */
  hideModal(modalId) {
    const modalConfig = this.modals.get(modalId);
    if (!modalConfig) return;

    const modal = document.getElementById(modalId);
    if (!modal) return;

    // 隐藏模态框
    modal.classList.remove('show');
    
    // 从模态框管理器移除
    modalManager.pop(modalConfig.proxy);

    // 调用隐藏回调
    modalConfig.onHide(modal);

    // 清理事件监听器
    this.unbindModalEvents(modal);

    this.activeModal = null;
  }

  /**
   * 绑定模态框事件
   * @private
   */
  bindModalEvents(modal, modalConfig) {
    // 关闭按钮
    const closeBtn = modal.querySelector('.config-modal-close, .modal-close');
    if (closeBtn) {
      closeBtn._clickHandler = () => this.hideModal(modal.id);
      closeBtn.addEventListener('click', closeBtn._clickHandler);
    }

    // 点击背景关闭
    if (modalConfig.backgroundClose) {
      modal._backgroundClickHandler = (e) => {
        if (e.target === modal) {
          this.hideModal(modal.id);
        }
      };
      modal.addEventListener('click', modal._backgroundClickHandler);
    }

    // ESC键关闭
    if (modalConfig.escapeClose) {
      modal._escapeHandler = (e) => {
        if (e.key === 'Escape' && this.activeModal === modal.id) {
          this.hideModal(modal.id);
        }
      };
      document.addEventListener('keydown', modal._escapeHandler);
    }

    // 保存按钮
    const saveBtn = modal.querySelector('.save-btn, .confirm-btn');
    if (saveBtn) {
      saveBtn._clickHandler = () => this.handleSave(modal, modalConfig);
      saveBtn.addEventListener('click', saveBtn._clickHandler);
    }
  }

  /**
   * 解绑模态框事件
   * @private
   */
  unbindModalEvents(modal) {
    // 移除关闭按钮事件
    const closeBtn = modal.querySelector('.config-modal-close, .modal-close');
    if (closeBtn && closeBtn._clickHandler) {
      closeBtn.removeEventListener('click', closeBtn._clickHandler);
      delete closeBtn._clickHandler;
    }

    // 移除背景点击事件
    if (modal._backgroundClickHandler) {
      modal.removeEventListener('click', modal._backgroundClickHandler);
      delete modal._backgroundClickHandler;
    }

    // 移除ESC键事件
    if (modal._escapeHandler) {
      document.removeEventListener('keydown', modal._escapeHandler);
      delete modal._escapeHandler;
    }

    // 移除保存按钮事件
    const saveBtn = modal.querySelector('.save-btn, .confirm-btn');
    if (saveBtn && saveBtn._clickHandler) {
      saveBtn.removeEventListener('click', saveBtn._clickHandler);
      delete saveBtn._clickHandler;
    }
  }

  /**
   * 处理保存
   * @private
   */
  async handleSave(modal, modalConfig) {
    try {
      // 获取表单数据
      const formData = this.getFormData(modal);

      // 验证数据
      const validationResult = modalConfig.validateData(formData);
      if (validationResult !== true) {
        notification.error(validationResult || '数据验证失败');
        return;
      }

      // 保存数据
      await modalConfig.onSave(formData);

      // 关闭模态框
      this.hideModal(modal.id);

      notification.success('保存成功');

    } catch (error) {
      logger.error('ModalEventHandler', 'Save failed:', error);
      notification.error(`保存失败: ${error.message}`);
    }
  }

  /**
   * 获取表单数据
   * @private
   */
  getFormData(modal) {
    const data = {};
    
    // 获取所有输入框
    modal.querySelectorAll('input, textarea, select').forEach(field => {
      if (field.name || field.id) {
        const key = field.name || field.id;
        
        if (field.type === 'checkbox') {
          data[key] = field.checked;
        } else if (field.type === 'radio') {
          if (field.checked) {
            data[key] = field.value;
          }
        } else {
          data[key] = field.value;
        }
      }
    });

    return data;
  }

  /**
   * 设置表单数据
   * @param {string} modalId
   * @param {Object} data
   */
  setFormData(modalId, data) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    Object.entries(data).forEach(([key, value]) => {
      const field = modal.querySelector(`[name="${key}"], #${key}`);
      if (field) {
        if (field.type === 'checkbox') {
          field.checked = !!value;
        } else if (field.type === 'radio') {
          const radio = modal.querySelector(`[name="${key}"][value="${value}"]`);
          if (radio) radio.checked = true;
        } else {
          field.value = value || '';
        }
      }
    });
  }

  /**
   * 清理所有模态框
   */
  dispose() {
    // 关闭所有打开的模态框
    if (this.activeModal) {
      this.hideModal(this.activeModal);
    }

    // 清理注册的模态框
    this.modals.clear();
  }
}

// 创建单例
export const modalEventHandler = new ModalEventHandler();
export default modalEventHandler;
