/**
 * 媒体速度控制服务模块
 * 提供媒体播放速度控制功能
 */

import domCache from '../utils/DOMCache.js';
import logger from '../utils/DebugLogger.js';

const SPEED_CONFIG = {
  speedStep: 0.1,
  boostMultiplier: 1.5,
  doubleClickDelay: 200,
  displayDuration: 1000,
  maxSpeed: 10,
};

class SpeedControlService {
  constructor() {
    // 单例模式：防止多次初始化
    if (SpeedControlService.instance) {
      return SpeedControlService.instance;
    }
    
    this.state = {
      baseSpeed: 1.0,
      isTempBoosted: false,
    };
    this.observer = null;
    this.initialized = false;
    
    // 保存实例
    SpeedControlService.instance = this;
  }

  /**
   * 初始化速度控制服务
   */
  init() {
    // 防止重复初始化
    if (this.initialized) {
      logger.debug('SpeedControlService', '速度控制服务已初始化，跳过重复初始化');
      return;
    }
    
    // 键盘事件由 ShortcutManager 统一管理
    this.observeMediaElements();
    this.applySpeedToExistingMedia();
    this.initialized = true;
    logger.debug('SpeedControlService', '速度控制服务初始化成功');
  }

  /**
   * 获取当前所有媒体元素（使用DOM缓存优化）
   */
  getMediaElements() {
    // 使用缓存减少DOM查询
    return domCache.getAll('video, audio', false);
  }

  /**
   * 应用速度到所有媒体元素
   */
  applySpeed(speed) {
    const mediaElements = this.getMediaElements();
    
    mediaElements.forEach(media => {
      media.playbackRate = speed;
      this.showSpeedIndicator(media, speed);
    });

    // 触发速度变化事件（用于事件驱动的UI更新）
    const speedChangeEvent = new CustomEvent('speed-changed', {
      detail: { speed, baseSpeed: this.state.baseSpeed }
    });
    document.dispatchEvent(speedChangeEvent);
  }

  /**
   * 显示速度指示器
   */
  showSpeedIndicator(media, speed) {
    const oldIndicator = media.parentElement?.querySelector('.speed-indicator');
    if (oldIndicator) {
      oldIndicator.remove();
    }

    const indicator = document.createElement('div');
    indicator.className = 'speed-indicator';
    indicator.textContent = `${speed.toFixed(2)}x`;
    indicator.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      font-family: monospace;
      z-index: 999999;
      pointer-events: none;
      transition: opacity 0.3s;
    `;

    if (media.parentElement) {
      const parentPosition = window.getComputedStyle(media.parentElement).position;
      if (parentPosition === 'static') {
        media.parentElement.style.position = 'relative';
      }
      media.parentElement.appendChild(indicator);

      setTimeout(() => {
        indicator.style.opacity = '0';
        setTimeout(() => {
          indicator.remove();
        }, 300);
      }, SPEED_CONFIG.displayDuration);
    }
  }

  /**
   * 调整基础速度
   */
  adjustBaseSpeed(delta) {
    this.state.baseSpeed = Math.max(0.1, Math.min(SPEED_CONFIG.maxSpeed, this.state.baseSpeed + delta));
    this.applySpeed(this.calculateFinalSpeed());
  }

  /**
   * 设置基础速度
   */
  setBaseSpeed(speed) {
    this.state.baseSpeed = Math.max(0.1, Math.min(SPEED_CONFIG.maxSpeed, speed));
    this.applySpeed(this.calculateFinalSpeed());
  }

  /**
   * 应用临时加速（长按option）
   */
  applyTemporaryBoost() {
    this.state.isTempBoosted = true;
    this.applySpeed(this.calculateFinalSpeed());
  }

  /**
   * 移除临时加速（松开option）
   */
  removeTemporaryBoost() {
    this.state.isTempBoosted = false;
    this.applySpeed(this.calculateFinalSpeed());
  }

  /**
   * 应用永久加速（双击option）
   */
  applyPermanentBoost() {
    this.state.baseSpeed = Math.min(SPEED_CONFIG.maxSpeed, this.state.baseSpeed * SPEED_CONFIG.boostMultiplier);
    this.applySpeed(this.calculateFinalSpeed());
  }

  /**
   * 重置为1倍速
   */
  resetToNormalSpeed() {
    this.state.baseSpeed = 1.0;
    this.applySpeed(this.calculateFinalSpeed());
  }

  /**
   * 设置为2倍速
   */
  setToDoubleSpeed() {
    this.state.baseSpeed = 2.0;
    this.applySpeed(this.calculateFinalSpeed());
  }

  /**
   * 计算最终速度（考虑所有加速因素）
   */
  calculateFinalSpeed() {
    let speed = this.state.baseSpeed;
    
    if (this.state.isTempBoosted) {
      speed *= SPEED_CONFIG.boostMultiplier;
    }
    
    return Math.min(SPEED_CONFIG.maxSpeed, speed);
  }

  /**
   * 监听新添加的媒体元素
   */
  observeMediaElements() {
    this.observer = new MutationObserver(() => {
      const mediaElements = this.getMediaElements();
      mediaElements.forEach(media => {
        const currentSpeed = this.calculateFinalSpeed();
        if (Math.abs(media.playbackRate - currentSpeed) > 0.01) {
          media.playbackRate = currentSpeed;
        }
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 对已存在的媒体元素应用初始速度
   */
  applySpeedToExistingMedia() {
    const mediaElements = this.getMediaElements();
    mediaElements.forEach(media => {
      media.playbackRate = this.state.baseSpeed;
    });
  }

  /**
   * 获取当前速度
   */
  getCurrentSpeed() {
    return this.calculateFinalSpeed();
  }

  /**
   * 获取当前状态（用于UI显示）
   */
  getState() {
    return {
      baseSpeed: this.state.baseSpeed,
      finalSpeed: this.calculateFinalSpeed(),
      isTempBoosted: this.state.isTempBoosted,
    };
  }

  /**
   * 清理资源
   */
  destroy() {
    logger.debug('SpeedControl', '开始清理资源');
    
    // 清理 MutationObserver
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    logger.debug('SpeedControl', '资源清理完成');
  }
}

// 创建全局单例
export const speedControlService = new SpeedControlService();
export default speedControlService;

