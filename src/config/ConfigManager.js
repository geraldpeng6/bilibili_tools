/**
 * 配置管理模块
 * 统一管理AI和Notion的配置，避免重复代码
 */

import { AI_DEFAULT_CONFIGS, STORAGE_KEYS } from '../constants.js';
import { validateApiKey, validateApiUrl, validateNotionPageId } from '../utils/validators.js';

class ConfigManager {
  /**
   * 获取AI配置列表
   * @returns {Array}
   */
  getAIConfigs() {
    const configs = GM_getValue(STORAGE_KEYS.AI_CONFIGS, []);
    if (configs.length === 0) {
      return [...AI_DEFAULT_CONFIGS]; // 返回默认配置的副本
    }
    return configs;
  }

  /**
   * 保存AI配置列表
   * @param {Array} configs
   */
  saveAIConfigs(configs) {
    GM_setValue(STORAGE_KEYS.AI_CONFIGS, configs);
  }

  /**
   * 获取当前选中的AI配置ID
   * @returns {string}
   */
  getSelectedAIConfigId() {
    return GM_getValue(STORAGE_KEYS.AI_SELECTED_ID, 'openrouter');
  }

  /**
   * 设置当前选中的AI配置ID
   * @param {string} id
   */
  setSelectedAIConfigId(id) {
    GM_setValue(STORAGE_KEYS.AI_SELECTED_ID, id);
  }

  /**
   * 获取当前选中的AI配置
   * @returns {Object|null}
   */
  getSelectedAIConfig() {
    const configs = this.getAIConfigs();
    const selectedId = this.getSelectedAIConfigId();
    return configs.find(c => c.id === selectedId) || configs[0] || null;
  }

  /**
   * 添加AI配置
   * @param {Object} config
   * @returns {{success: boolean, error: string|null}}
   */
  addAIConfig(config) {
    // 验证必填字段
    if (!config.name || !config.url || !config.apiKey || !config.model) {
      return { success: false, error: '所有字段都是必填的' };
    }

    // 验证URL
    const urlValidation = validateApiUrl(config.url);
    if (!urlValidation.valid) {
      return { success: false, error: urlValidation.error };
    }

    // 验证API Key
    const keyValidation = validateApiKey(config.apiKey);
    if (!keyValidation.valid) {
      return { success: false, error: keyValidation.error };
    }

    const configs = this.getAIConfigs();
    const newConfig = {
      id: Date.now().toString(),
      name: config.name.trim(),
      url: config.url.trim(),
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
      prompt: config.prompt || '根据以下视频字幕，用中文总结视频内容：\n\n',
      isOpenRouter: config.isOpenRouter || false
    };

    configs.push(newConfig);
    this.saveAIConfigs(configs);
    this.setSelectedAIConfigId(newConfig.id);

    return { success: true, error: null, config: newConfig };
  }

  /**
   * 更新AI配置
   * @param {string} id
   * @param {Object} updates
   * @returns {{success: boolean, error: string|null}}
   */
  updateAIConfig(id, updates) {
    const configs = this.getAIConfigs();
    const index = configs.findIndex(c => c.id === id);
    
    if (index === -1) {
      return { success: false, error: '配置不存在' };
    }

    // 验证更新的字段
    if (updates.url) {
      const urlValidation = validateApiUrl(updates.url);
      if (!urlValidation.valid) {
        return { success: false, error: urlValidation.error };
      }
    }

    if (updates.apiKey) {
      const keyValidation = validateApiKey(updates.apiKey);
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error };
      }
    }

    configs[index] = { ...configs[index], ...updates };
    this.saveAIConfigs(configs);

    return { success: true, error: null };
  }

  /**
   * 删除AI配置
   * @param {string} id
   * @returns {{success: boolean, error: string|null}}
   */
  deleteAIConfig(id) {
    // 不允许删除预设配置
    if (id === 'openrouter' || id === 'openai') {
      return { success: false, error: '预设配置不能删除' };
    }

    let configs = this.getAIConfigs();
    configs = configs.filter(c => c.id !== id);
    this.saveAIConfigs(configs);

    // 如果删除的是当前选中的配置，切换到默认配置
    if (this.getSelectedAIConfigId() === id) {
      this.setSelectedAIConfigId('openrouter');
    }

    return { success: true, error: null };
  }

  /**
   * 获取AI自动总结开关状态
   * @returns {boolean}
   */
  getAIAutoSummaryEnabled() {
    return GM_getValue(STORAGE_KEYS.AI_AUTO_SUMMARY, true);
  }

  /**
   * 设置AI自动总结开关状态
   * @param {boolean} enabled
   */
  setAIAutoSummaryEnabled(enabled) {
    GM_setValue(STORAGE_KEYS.AI_AUTO_SUMMARY, enabled);
  }

  /**
   * 获取Notion配置
   * @returns {{apiKey: string, parentPageId: string, databaseId: string}}
   */
  getNotionConfig() {
    return {
      apiKey: GM_getValue(STORAGE_KEYS.NOTION_API_KEY, ''),
      parentPageId: GM_getValue(STORAGE_KEYS.NOTION_PARENT_PAGE_ID, ''),
      databaseId: GM_getValue(STORAGE_KEYS.NOTION_DATABASE_ID, '')
    };
  }

  /**
   * 保存Notion配置
   * @param {Object} config
   * @returns {{success: boolean, error: string|null}}
   */
  saveNotionConfig(config) {
    // 验证API Key
    if (config.apiKey) {
      const keyValidation = validateApiKey(config.apiKey);
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error };
      }
      GM_setValue(STORAGE_KEYS.NOTION_API_KEY, config.apiKey.trim());
    }

    // 验证Page ID
    if (config.parentPageId) {
      const pageIdValidation = validateNotionPageId(config.parentPageId);
      if (!pageIdValidation.valid) {
        return { success: false, error: pageIdValidation.error };
      }
      GM_setValue(STORAGE_KEYS.NOTION_PARENT_PAGE_ID, pageIdValidation.cleaned);
    }

    // 保存Database ID
    if (config.databaseId !== undefined) {
      GM_setValue(STORAGE_KEYS.NOTION_DATABASE_ID, config.databaseId);
    }

    return { success: true, error: null };
  }

  /**
   * 获取Notion自动发送开关状态
   * @returns {boolean}
   */
  getNotionAutoSendEnabled() {
    return GM_getValue(STORAGE_KEYS.NOTION_AUTO_SEND, false);
  }

  /**
   * 设置Notion自动发送开关状态
   * @param {boolean} enabled
   */
  setNotionAutoSendEnabled(enabled) {
    GM_setValue(STORAGE_KEYS.NOTION_AUTO_SEND, enabled);
  }
}

// 创建全局单例
export const config = new ConfigManager();
export default config;

