/**
 * 配置管理模块
 * 统一管理所有配置项
 */

import { AI_DEFAULT_CONFIGS, STORAGE_KEYS } from '../constants.js';
import logger from '../utils/DebugLogger.js';
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
    
    // 迁移旧配置：将prompt字段迁移到prompt1和prompt2
    const migratedConfigs = configs.map(config => {
      if (config.prompt && (!config.prompt1 || !config.prompt2)) {
        return {
          ...config,
          prompt1: config.prompt,
          prompt2: this._getDefaultPrompt2(), // 使用JSON格式的默认提示词
          prompt: undefined
        };
      }
      return config;
    });
    
    // 如果有迁移，保存迁移后的配置
    if (migratedConfigs.some(c => c.prompt === undefined && configs.some(oc => oc.prompt))) {
      this.saveAIConfigs(migratedConfigs);
    }
    
    return migratedConfigs;
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
      prompt1: config.prompt1 || '',
      prompt2: config.prompt2 || '',
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

    // 验证API Key
    if (updates.apiKey !== undefined) {
      const keyValidation = validateApiKey(updates.apiKey, configs[index].isOpenRouter);
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error };
      }
    }

    // 验证API URL
    if (updates.url !== undefined) {
      const urlValidation = validateApiUrl(updates.url);
      if (!urlValidation.valid) {
        return { success: false, error: urlValidation.error };
      }
    }

    // 处理prompt迁移
    if (updates.prompt && (!updates.prompt1 || !updates.prompt2)) {
      updates.prompt1 = updates.prompt;
      updates.prompt2 = this._getDefaultPrompt2(); // 使用JSON格式的默认提示词
      delete updates.prompt;
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

  /**
   * 修复已存在的配置，确保prompt2使用正确的JSON格式
   * @returns {boolean} 是否进行了修复
   */
  fixExistingConfigPrompts() {
    const configs = this.getAIConfigs();
    let hasFixed = false;
    
    const fixedConfigs = configs.map(config => {
      // 如果prompt1和prompt2相同，或者prompt2包含TL;DR（说明用了markdown格式），则修复
      if (config.prompt1 && config.prompt2 && 
          (config.prompt1 === config.prompt2 || config.prompt2.includes('TL;DR'))) {
        hasFixed = true;
        return {
          ...config,
          prompt2: this._getDefaultPrompt2()
        };
      }
      return config;
    });
    
    if (hasFixed) {
      this.saveAIConfigs(fixedConfigs);
      logger.debug('ConfigManager', '已修复配置中的prompt2为JSON格式');
    }
    
    return hasFixed;
  }

  /**
   * 获取JSON格式的默认提示词
   * @private
   * @returns {string}
   */
  _getDefaultPrompt2() {
    return `分析以下带时间戳的字幕，提取5-8个关键段落。

重要：你的回复必须只包含JSON，不要有任何其他文字、解释或markdown标记。
直接以{开始，以}结束。

JSON格式要求：
{"segments":[
  {"timestamp":"分钟:秒","title":"标题(10字内)","summary":"内容总结(30-50字)"}
]}

示例（你的回复应该像这样）：
{"segments":[{"timestamp":"00:15","title":"开场介绍","summary":"主持人介绍今天的主题和嘉宾背景"},{"timestamp":"02:30","title":"核心观点","summary":"讨论技术发展趋势和未来展望"}]}

字幕内容：
`;
  }
}

// 创建全局单例
export const config = new ConfigManager();
export default config;

