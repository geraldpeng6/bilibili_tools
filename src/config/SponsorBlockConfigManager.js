/**
 * SponsorBlock配置管理模块
 * 管理SponsorBlock相关的所有配置
 */

import { SPONSORBLOCK } from '../constants.js';

const STORAGE_KEY = 'sponsorblock_settings';

class SponsorBlockConfigManager {
  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * 加载设置
   * @returns {Object}
   */
  loadSettings() {
    const saved = GM_getValue(STORAGE_KEY, null);
    return saved ? JSON.parse(saved) : { ...SPONSORBLOCK.DEFAULT_SETTINGS };
  }

  /**
   * 保存设置
   * @param {Object} settings
   */
  saveSettings(settings) {
    this.settings = settings;
    GM_setValue(STORAGE_KEY, JSON.stringify(settings));
  }

  /**
   * 获取单个设置
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this.settings[key];
  }

  /**
   * 设置单个值
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    this.settings[key] = value;
    this.saveSettings(this.settings);
  }

  /**
   * 获取所有设置
   * @returns {Object}
   */
  getAll() {
    return { ...this.settings };
  }

  /**
   * 设置所有设置
   * @param {Object} settings
   */
  setAll(settings) {
    this.saveSettings(settings);
  }

  /**
   * 重置为默认设置
   */
  resetToDefaults() {
    this.saveSettings({ ...SPONSORBLOCK.DEFAULT_SETTINGS });
  }
}

// 创建全局单例
export const sponsorBlockConfig = new SponsorBlockConfigManager();
export default sponsorBlockConfig;

