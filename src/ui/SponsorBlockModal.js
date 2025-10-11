/**
 * SponsorBlock配置模态框模块
 * 提供SponsorBlock设置界面
 */

import { SPONSORBLOCK } from '../constants.js';
import sponsorBlockConfig from '../config/SponsorBlockConfigManager.js';
import notification from './Notification.js';
import modalManager from '../utils/ModalManager.js';

class SponsorBlockModal {
  constructor() {
    this.modal = null;
  }

  /**
   * 创建模态框
   */
  createModal() {
    if (this.modal) {
      return this.modal;
    }

    this.modal = document.createElement('div');
    this.modal.id = 'sponsorblock-modal';
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
    
    // 注册到模态框管理器（统一处理ESC键）
    modalManager.push(this);
  }

  /**
   * 隐藏模态框
   */
  hide() {
    if (this.modal) {
      this.modal.classList.remove('show');
    }
    
    // 从模态框管理器移除
    modalManager.pop(this);
  }

  /**
   * 渲染模态框内容
   */
  renderModal() {
    const currentSettings = sponsorBlockConfig.getAll();

    this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>SponsorBlock 设置</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">使用说明</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              <strong>勾选的类别</strong> → 自动跳过<br>
              <strong>未勾选的类别</strong> → 显示手动提示（5秒后自动消失）<br>
              在进度条上会显示彩色标记，点击可查看详情
            </div>
          </div>

          <div class="sponsor-settings-section">
            <h3>片段类别（勾选=自动跳过，未勾选=手动提示）</h3>
            <div class="sponsor-checkbox-group">
              ${Object.entries(SPONSORBLOCK.CATEGORIES).map(([key, info]) => `
                <div class="sponsor-checkbox-item">
                  <input type="checkbox" 
                         id="category-${key}" 
                         value="${key}"
                         ${currentSettings.skipCategories.includes(key) ? 'checked' : ''}>
                  <label for="category-${key}">
                    <span class="category-color-dot" style="background: ${info.color}"></span>
                    <span>${info.name}</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="sponsor-settings-section">
            <h3>显示选项</h3>
            <div class="sponsor-switch-item">
              <span>显示片段标签（视频卡片）</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="showAdBadge" 
                       ${currentSettings.showAdBadge ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </div>
            <div class="sponsor-switch-item">
              <span>显示优质视频标签</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="showQualityBadge" 
                       ${currentSettings.showQualityBadge ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </div>
            <div class="sponsor-switch-item">
              <span>进度条显示片段标记</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="showProgressMarkers" 
                       ${currentSettings.showProgressMarkers ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="sponsorblock-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="sponsorblock-save-btn">保存</button>
        </div>
      </div>
    `;

    this.bindEvents();
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

    // 保存按钮
    const saveBtn = document.getElementById('sponsorblock-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveSettings());
    }

    // 取消按钮
    const cancelBtn = document.getElementById('sponsorblock-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hide());
    }
  }

  /**
   * 保存设置
   */
  saveSettings() {
    const newSettings = {
      skipCategories: Array.from(
        this.modal.querySelectorAll('.sponsor-checkbox-item input[type="checkbox"]:checked')
      ).map(cb => cb.value),
      showAdBadge: this.modal.querySelector('#showAdBadge').checked,
      showQualityBadge: this.modal.querySelector('#showQualityBadge').checked,
      showProgressMarkers: this.modal.querySelector('#showProgressMarkers').checked
    };

    sponsorBlockConfig.setAll(newSettings);
    this.hide();

    // 提示保存成功并刷新页面
    notification.info('设置已保存！\n\n✅ 勾选的类别 → 自动跳过\n⏸️ 未勾选的类别 → 手动提示（5秒）\n\n页面将刷新以应用新设置。');
    
    setTimeout(() => {
      location.reload();
    }, 2000);
  }
}

// 创建全局单例
export const sponsorBlockModal = new SponsorBlockModal();
export default sponsorBlockModal;

