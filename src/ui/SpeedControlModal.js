/**
 * 速度控制模态框模块
 * 提供播放速度控制的独立界面
 */

import speedControlService from '../services/SpeedControlService.js';
import notification from './Notification.js';

class SpeedControlModal {
  constructor() {
    this.modal = null;
    this.updateInterval = null;
  }

  /**
   * 创建模态框
   */
  createModal() {
    if (this.modal) {
      return this.modal;
    }

    this.modal = document.createElement('div');
    this.modal.id = 'speed-control-modal';
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
    
    // 开始定期更新速度显示
    this.startUpdateLoop();
  }

  /**
   * 隐藏模态框
   */
  hide() {
    if (this.modal) {
      this.modal.classList.remove('show');
    }
    
    // 停止更新
    this.stopUpdateLoop();
  }

  /**
   * 渲染模态框内容
   */
  renderModal() {
    const state = speedControlService.getState();

    this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>播放速度控制</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">快捷键说明</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              <strong>,</strong> 减速 | <strong>.</strong> 加速 | <strong>,,</strong> 重置1x | <strong>..</strong> 2倍速<br>
              <strong>右Option</strong> 临时加速 | <strong>右Option双击</strong> 永久加速<br>
              <strong>, + .</strong> 同时按切换响度检测
            </div>
          </div>

          <div class="speed-control-section-large">
            <div class="speed-control-header-large">
              <span class="speed-control-title">当前速度</span>
              <span class="speed-control-display-large" id="speed-display-modal">${state.finalSpeed.toFixed(2)}x</span>
            </div>
            
            <div class="speed-control-buttons-large">
              <button class="speed-btn-large" data-action="decrease">
                <span style="font-size: 24px;">−</span>
                <span style="font-size: 11px;">减速</span>
              </button>
              <button class="speed-btn-large" data-action="reset">
                <span style="font-size: 18px;">1x</span>
                <span style="font-size: 11px;">重置</span>
              </button>
              <button class="speed-btn-large" data-action="double">
                <span style="font-size: 18px;">2x</span>
                <span style="font-size: 11px;">2倍速</span>
              </button>
              <button class="speed-btn-large" data-action="increase">
                <span style="font-size: 24px;">+</span>
                <span style="font-size: 11px;">加速</span>
              </button>
            </div>

            <div class="speed-status-info">
              ${state.isTempBoosted ? '<div class="speed-status-item">临时加速中 (右Option)</div>' : ''}
              ${state.isVolumeBoosted ? '<div class="speed-status-item">响度加速中</div>' : ''}
            </div>
          </div>

          <div class="config-field" style="margin-top: 20px;">
            <label style="display: flex; align-items: center; justify-content: space-between;">
              <span>响度检测自动加速</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="volume-detection-toggle" ${state.volumeDetectionEnabled ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </label>
            <div class="config-help" style="margin-top: 8px;">
              开启后，当检测到音量低于阈值时自动提速 ${speedControlService.state.boostMultiplier}x
            </div>
          </div>

          ${state.volumeDetectionEnabled ? `
            <div class="config-field">
              <label>响度阈值 (dB)</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button class="config-btn config-btn-secondary" style="padding: 8px 16px;" id="threshold-decrease">-</button>
                <input type="number" 
                       id="volume-threshold-input" 
                       value="${state.currentVolumeThreshold}" 
                       min="-100" 
                       max="0" 
                       step="1"
                       style="flex: 1; text-align: center;">
                <button class="config-btn config-btn-secondary" style="padding: 8px 16px;" id="threshold-increase">+</button>
              </div>
              <div class="config-help">
                当前阈值: ${state.currentVolumeThreshold}dB (低于此值触发加速)
              </div>
            </div>
          ` : ''}
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="speed-close-btn">关闭</button>
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

    // 速度按钮
    const speedButtons = this.modal.querySelectorAll('.speed-btn-large');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        this.handleSpeedAction(action);
      });
    });

    // 响度检测开关
    const volumeToggle = document.getElementById('volume-detection-toggle');
    if (volumeToggle) {
      volumeToggle.addEventListener('change', () => {
        speedControlService.toggleVolumeDetection();
        this.renderModal();
      });
    }

    // 阈值调整
    const thresholdDecrease = document.getElementById('threshold-decrease');
    const thresholdIncrease = document.getElementById('threshold-increase');
    const thresholdInput = document.getElementById('volume-threshold-input');

    if (thresholdDecrease) {
      thresholdDecrease.addEventListener('click', () => {
        speedControlService.adjustVolumeThreshold(-1);
        this.updateThresholdDisplay();
      });
    }

    if (thresholdIncrease) {
      thresholdIncrease.addEventListener('click', () => {
        speedControlService.adjustVolumeThreshold(1);
        this.updateThresholdDisplay();
      });
    }

    if (thresholdInput) {
      thresholdInput.addEventListener('change', (e) => {
        const value = parseInt(e.target.value);
        if (!isNaN(value)) {
          speedControlService.state.currentVolumeThreshold = Math.max(-100, Math.min(0, value));
          this.updateThresholdDisplay();
        }
      });
    }

    // 关闭按钮
    const closeBtn = document.getElementById('speed-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
  }

  /**
   * 处理速度操作
   */
  handleSpeedAction(action) {
    switch (action) {
      case 'increase':
        speedControlService.adjustBaseSpeed(0.1);
        break;
      case 'decrease':
        speedControlService.adjustBaseSpeed(-0.1);
        break;
      case 'reset':
        speedControlService.resetToNormalSpeed();
        break;
      case 'double':
        speedControlService.setToDoubleSpeed();
        break;
    }
    this.updateSpeedDisplay();
  }

  /**
   * 更新速度显示
   */
  updateSpeedDisplay() {
    const speedDisplay = document.getElementById('speed-display-modal');
    if (speedDisplay) {
      const speed = speedControlService.getCurrentSpeed();
      speedDisplay.textContent = `${speed.toFixed(2)}x`;
    }
  }

  /**
   * 更新阈值显示
   */
  updateThresholdDisplay() {
    const input = document.getElementById('volume-threshold-input');
    if (input) {
      input.value = speedControlService.state.currentVolumeThreshold;
    }
  }

  /**
   * 开始更新循环
   */
  startUpdateLoop() {
    this.updateInterval = setInterval(() => {
      this.updateSpeedDisplay();
    }, 200);
  }

  /**
   * 停止更新循环
   */
  stopUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

// 创建全局单例
export const speedControlModal = new SpeedControlModal();
export default speedControlModal;

