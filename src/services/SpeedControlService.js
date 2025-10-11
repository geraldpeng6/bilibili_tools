/**
 * 媒体速度控制服务模块
 * 提供媒体播放速度控制和响度检测功能
 */

import domCache from '../utils/DOMCache.js';
import audioContextPool from '../utils/AudioContextPool.js';

const SPEED_CONFIG = {
  speedStep: 0.1,
  boostMultiplier: 1.5,
  doubleClickDelay: 200,
  displayDuration: 1000,
  maxSpeed: 10,
  volumeThreshold: -40,
  volumeThresholdStep: 1,
  volumeCheckInterval: 100,
};

class SpeedControlService {
  constructor() {
    this.state = {
      baseSpeed: 1.0,
      isRightOptionPressed: false,
      isTempBoosted: false,
      lastKeyPressTime: { comma: 0, period: 0 },
      lastOptionPressTime: 0,
      optionDoubleClickTimer: null,
      volumeDetectionEnabled: false,
      currentVolumeThreshold: -40,
      isVolumeBoosted: false,
      mediaAnalyzers: new Map(),
      commaPressed: false,
      periodPressed: false,
      volumeHistory: [],
      maxHistoryLength: 100,
      volumeChart: null,
    };
    this.observer = null;
  }

  /**
   * 初始化速度控制服务
   */
  init() {
    this.bindKeyboardEvents();
    this.observeMediaElements();
    this.applySpeedToExistingMedia();
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
   * 检测双击
   */
  detectDoubleClick(keyType) {
    const now = Date.now();
    const lastTime = this.state.lastKeyPressTime[keyType];
    this.state.lastKeyPressTime[keyType] = now;

    if (now - lastTime < SPEED_CONFIG.doubleClickDelay) {
      return true;
    }
    return false;
  }

  /**
   * 计算最终速度（考虑所有加速因素）
   */
  calculateFinalSpeed() {
    let speed = this.state.baseSpeed;
    
    if (this.state.isTempBoosted) {
      speed *= SPEED_CONFIG.boostMultiplier;
    }
    
    if (this.state.isVolumeBoosted) {
      speed *= SPEED_CONFIG.boostMultiplier;
    }
    
    return Math.min(SPEED_CONFIG.maxSpeed, speed);
  }

  /**
   * 为媒体元素创建音频分析器（使用AudioContext池优化）
   */
  setupVolumeAnalyzer(media) {
    try {
      if (this.state.mediaAnalyzers.has(media)) {
        const existing = this.state.mediaAnalyzers.get(media);
        // 更新使用时间
        audioContextPool.touch(media);
        return existing;
      }

      // 从池中获取或创建AudioContext
      const poolEntry = audioContextPool.getOrCreate(media, false);
      
      const analyzer = {
        context: poolEntry.context,
        analyser: poolEntry.analyzer,
        dataArray: new Uint8Array(poolEntry.analyzer.frequencyBinCount),
        rafId: null, // 使用RAF代替intervalId
        intervalId: null // 保留用于向后兼容
      };

      this.state.mediaAnalyzers.set(media, analyzer);
      return analyzer;
    } catch (error) {
      console.error('[SpeedControlService] 创建音频分析器失败:', error);
      return null;
    }
  }

  /**
   * 计算当前响度（dB）
   */
  getVolumeLevel(analyzer) {
    analyzer.analyser.getByteFrequencyData(analyzer.dataArray);
    
    let sum = 0;
    for (let i = 0; i < analyzer.dataArray.length; i++) {
      sum += analyzer.dataArray[i];
    }
    const average = sum / analyzer.dataArray.length;
    
    if (average === 0) return -Infinity;
    const db = 20 * Math.log10(average / 255);
    
    return db;
  }

  /**
   * 开始监测特定媒体元素的响度（使用RAF优化，节流到200ms）
   */
  startVolumeDetection(media) {
    const analyzer = this.setupVolumeAnalyzer(media);
    if (!analyzer) return;

    // 清理旧的检测循环
    if (analyzer.rafId) {
      cancelAnimationFrame(analyzer.rafId);
    }
    if (analyzer.intervalId) {
      clearInterval(analyzer.intervalId);
    }

    this.createVolumeChart(media);

    // 使用RAF + 节流优化性能
    let lastCheck = 0;
    const checkInterval = 200; // 降低检测频率到200ms

    const volumeCheckLoop = (timestamp) => {
      // 检查是否应该继续检测
      if (!this.state.volumeDetectionEnabled || !this.state.mediaAnalyzers.has(media)) {
        return;
      }

      // 节流：只在间隔时间后检测
      if (timestamp - lastCheck >= checkInterval) {
        // 如果视频暂停，跳过检测但继续循环
        if (!media.paused) {
          const volumeDb = this.getVolumeLevel(analyzer);
          const shouldBoost = volumeDb < this.state.currentVolumeThreshold;

          this.updateVolumeChart(volumeDb);

          if (shouldBoost && !this.state.isVolumeBoosted) {
            this.state.isVolumeBoosted = true;
            this.applySpeed(this.calculateFinalSpeed());
          } else if (!shouldBoost && this.state.isVolumeBoosted) {
            this.state.isVolumeBoosted = false;
            this.applySpeed(this.calculateFinalSpeed());
          }
        }
        lastCheck = timestamp;
      }

      // 继续循环
      analyzer.rafId = requestAnimationFrame(volumeCheckLoop);
    };

    // 启动RAF循环
    analyzer.rafId = requestAnimationFrame(volumeCheckLoop);
  }

  /**
   * 停止监测并清理资源（使用池化优化）
   */
  stopVolumeDetection(media) {
    const analyzer = this.state.mediaAnalyzers.get(media);
    if (!analyzer) return;

    // 取消RAF循环
    if (analyzer.rafId) {
      cancelAnimationFrame(analyzer.rafId);
      analyzer.rafId = null;
    }

    // 清理旧的interval（向后兼容）
    if (analyzer.intervalId) {
      clearInterval(analyzer.intervalId);
      analyzer.intervalId = null;
    }

    // 断开连接但不关闭Context（池化复用）
    audioContextPool.disconnect(media);

    this.state.mediaAnalyzers.delete(media);

    if (this.state.volumeChart) {
      this.state.volumeChart.remove();
      this.state.volumeChart = null;
    }
    this.state.volumeHistory = [];
  }

  /**
   * 切换响度检测功能
   */
  toggleVolumeDetection() {
    this.state.volumeDetectionEnabled = !this.state.volumeDetectionEnabled;
    
    if (this.state.volumeDetectionEnabled) {
      const mediaElements = this.getMediaElements();
      mediaElements.forEach(media => {
        this.startVolumeDetection(media);
      });
    } else {
      const mediaElements = this.getMediaElements();
      mediaElements.forEach(media => {
        this.stopVolumeDetection(media);
      });
      
      if (this.state.isVolumeBoosted) {
        this.state.isVolumeBoosted = false;
        this.applySpeed(this.calculateFinalSpeed());
      }
    }
  }

  /**
   * 调整响度阈值
   */
  adjustVolumeThreshold(delta) {
    this.state.currentVolumeThreshold += delta;
    this.state.currentVolumeThreshold = Math.max(-100, Math.min(0, this.state.currentVolumeThreshold));
    
    // 显示图表
    if (this.state.volumeChart) {
      this.state.volumeChart.style.opacity = '1';
      
      // 清除旧定时器
      if (this.hideChartTimer) {
        clearTimeout(this.hideChartTimer);
      }
      
      // 5秒后重新隐藏
      this.hideChartTimer = setTimeout(() => {
        if (this.state.volumeChart) {
          this.state.volumeChart.style.opacity = '0';
        }
      }, 5000);
    }
  }

  /**
   * 创建响度图表
   */
  createVolumeChart(media) {
    if (this.state.volumeChart) {
      this.state.volumeChart.remove();
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'volume-chart';
    canvas.width = 300;
    canvas.height = 150;
    canvas.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(12px);
      border: 2px solid #feebea;
      border-radius: 8px;
      z-index: 999999;
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.3s;
    `;

    if (media.parentElement) {
      const parentPosition = window.getComputedStyle(media.parentElement).position;
      if (parentPosition === 'static') {
        media.parentElement.style.position = 'relative';
      }
      media.parentElement.appendChild(canvas);
    }

    this.state.volumeChart = canvas;
    this.state.volumeHistory = [];
    
    // 5秒后隐藏
    this.hideChartTimer = setTimeout(() => {
      if (canvas) {
        canvas.style.opacity = '0';
      }
    }, 5000);
    
    return canvas;
  }

  /**
   * 更新响度图表
   */
  updateVolumeChart(volumeDb) {
    if (!this.state.volumeChart) return;

    const canvas = this.state.volumeChart;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    this.state.volumeHistory.push(volumeDb);
    if (this.state.volumeHistory.length > this.state.maxHistoryLength) {
      this.state.volumeHistory.shift();
    }

    ctx.clearRect(0, 0, width, height);

    const padding = 30;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    
    const minDb = -60;
    const maxDb = 0;

    const dbToY = (db) => {
      const clampedDb = Math.max(minDb, Math.min(maxDb, db));
      const ratio = (clampedDb - minDb) / (maxDb - minDb);
      return height - padding - ratio * chartHeight;
    };

    // 绘制坐标轴
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // 绘制刻度和标签
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    
    for (let db = minDb; db <= maxDb; db += 20) {
      const y = dbToY(db);
      ctx.fillText(`${db}dB`, padding - 5, y + 3);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // 绘制红色阈值线
    ctx.strokeStyle = '#FF5252';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const thresholdY = dbToY(this.state.currentVolumeThreshold);
    ctx.beginPath();
    ctx.moveTo(padding, thresholdY);
    ctx.lineTo(width - padding, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#FF5252';
    ctx.textAlign = 'left';
    ctx.fillText(`阈值: ${this.state.currentVolumeThreshold.toFixed(0)}dB`, width - padding + 5, thresholdY + 3);

    // 绘制绿色响度曲线
    if (this.state.volumeHistory.length > 1) {
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const xStep = chartWidth / (this.state.maxHistoryLength - 1);
      
      this.state.volumeHistory.forEach((db, index) => {
        const x = padding + index * xStep;
        const y = dbToY(db);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      const lastDb = this.state.volumeHistory[this.state.volumeHistory.length - 1];
      const lastX = padding + (this.state.volumeHistory.length - 1) * xStep;
      const lastY = dbToY(lastDb);
      
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillText(`${lastDb.toFixed(1)}dB`, lastX + 5, lastY - 5);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('响度检测', width / 2, 15);
  }

  /**
   * 绑定键盘事件
   */
  bindKeyboardEvents() {
    document.addEventListener('keydown', (event) => this.handleKeyDown(event), true);
    document.addEventListener('keyup', (event) => this.handleKeyUp(event), true);
  }

  /**
   * 键盘按下事件处理
   */
  handleKeyDown(event) {
    // 检测右侧Option键
    if (event.code === 'AltRight' && event.location === 2) {
      if (!this.state.isRightOptionPressed) {
        this.state.isRightOptionPressed = true;
        
        const now = Date.now();
        if (now - this.state.lastOptionPressTime < SPEED_CONFIG.doubleClickDelay) {
          this.applyPermanentBoost();
          
          if (this.state.optionDoubleClickTimer) {
            clearTimeout(this.state.optionDoubleClickTimer);
            this.state.optionDoubleClickTimer = null;
          }
        } else {
          this.applyTemporaryBoost();
        }
        
        this.state.lastOptionPressTime = now;
      }
      return;
    }

    // 忽略在输入框中的按键
    if (event.target.tagName === 'INPUT' || 
        event.target.tagName === 'TEXTAREA' || 
        event.target.isContentEditable) {
      return;
    }

    // 检测句号键 (.)
    if (event.code === 'Period') {
      if (event.altKey) {
        event.preventDefault();
        this.adjustVolumeThreshold(SPEED_CONFIG.volumeThresholdStep);
        return;
      }
      
      if (!this.state.periodPressed) {
        this.state.periodPressed = true;
        
        if (this.state.commaPressed) {
          event.preventDefault();
          this.toggleVolumeDetection();
          return;
        }
      }
      
      event.preventDefault();
      
      if (this.detectDoubleClick('period')) {
        this.setToDoubleSpeed();
      } else {
        this.adjustBaseSpeed(SPEED_CONFIG.speedStep);
      }
      return;
    }

    // 检测逗号键 (,)
    if (event.code === 'Comma') {
      if (event.altKey) {
        event.preventDefault();
        this.adjustVolumeThreshold(-SPEED_CONFIG.volumeThresholdStep);
        return;
      }
      
      if (!this.state.commaPressed) {
        this.state.commaPressed = true;
        
        if (this.state.periodPressed) {
          event.preventDefault();
          this.toggleVolumeDetection();
          return;
        }
      }
      
      event.preventDefault();
      
      if (this.detectDoubleClick('comma')) {
        this.resetToNormalSpeed();
      } else {
        this.adjustBaseSpeed(-SPEED_CONFIG.speedStep);
      }
      return;
    }
  }

  /**
   * 键盘释放事件处理
   */
  handleKeyUp(event) {
    if (event.code === 'AltRight' && event.location === 2) {
      if (this.state.isRightOptionPressed) {
        this.state.isRightOptionPressed = false;
        
        this.state.optionDoubleClickTimer = setTimeout(() => {
          if (!this.state.isRightOptionPressed && this.state.isTempBoosted) {
            this.removeTemporaryBoost();
          }
        }, SPEED_CONFIG.doubleClickDelay);
      }
      return;
    }

    if (event.code === 'Period') {
      this.state.periodPressed = false;
      return;
    }

    if (event.code === 'Comma') {
      this.state.commaPressed = false;
      return;
    }
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
        
        if (this.state.volumeDetectionEnabled && !this.state.mediaAnalyzers.has(media)) {
          this.startVolumeDetection(media);
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
      isVolumeBoosted: this.state.isVolumeBoosted,
      volumeDetectionEnabled: this.state.volumeDetectionEnabled,
      currentVolumeThreshold: this.state.currentVolumeThreshold,
    };
  }

  /**
   * 清理资源（优化：完整清理所有资源）
   */
  destroy() {
    console.log('[SpeedControl] 开始清理资源');
    
    // 清理 MutationObserver
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // 清理所有媒体的音量检测
    this.getMediaElements().forEach(media => {
      this.stopVolumeDetection(media);
    });
    
    // 清理响度图表
    if (this.state.volumeChart) {
      this.state.volumeChart.remove();
      this.state.volumeChart = null;
    }
    
    // 清理所有 AudioContext
    this.state.mediaAnalyzers.forEach((analyzer, media) => {
      if (analyzer.intervalId) {
        clearInterval(analyzer.intervalId);
      }
      if (analyzer.context && analyzer.context.state !== 'closed') {
        analyzer.context.close().catch(err => {
          console.error('[SpeedControl] 关闭 AudioContext 失败:', err);
        });
      }
    });
    this.state.mediaAnalyzers.clear();
    
    // 清理定时器
    if (this.hideChartTimer) {
      clearTimeout(this.hideChartTimer);
      this.hideChartTimer = null;
    }
    
    // 重置状态
    this.state.volumeHistory = [];
    this.state.volumeDetectionEnabled = false;
    this.state.isVolumeBoosted = false;
    
    console.log('[SpeedControl] 资源清理完成');
  }
}

// 创建全局单例
export const speedControlService = new SpeedControlService();
export default speedControlService;

