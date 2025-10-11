/**
 * 搜索索引
 * 为字幕内容建立倒排索引，提升搜索性能
 */

class SearchIndex {
  constructor() {
    this.index = new Map(); // 词 -> [项索引列表]
    this.items = []; // 原始数据
    this.minWordLength = 1; // 最小分词长度
  }

  /**
   * 构建索引
   * @param {Array} items - 字幕数据数组
   */
  buildIndex(items) {
    this.items = items;
    this.index.clear();

    items.forEach((item, itemIndex) => {
      const words = this.tokenize(item.content);
      
      words.forEach(word => {
        if (!this.index.has(word)) {
          this.index.set(word, []);
        }
        // 避免重复添加
        const indices = this.index.get(word);
        if (!indices.includes(itemIndex)) {
          indices.push(itemIndex);
        }
      });
    });

    console.log(`[SearchIndex] 索引构建完成: ${this.index.size} 个词, ${items.length} 项数据`);
  }

  /**
   * 分词（简单实现：按字符和标点分词）
   * @param {string} text - 文本
   * @returns {Array<string>}
   */
  tokenize(text) {
    if (!text) return [];
    
    const words = [];
    
    // 中文：每个字作为一个词
    // 英文：按空格和标点分词
    const chars = text.toLowerCase();
    
    // 提取所有子串（n-gram）
    for (let i = 0; i < chars.length; i++) {
      // 单字符
      if (chars[i].trim()) {
        words.push(chars[i]);
      }
      
      // 2-4字符组合（提高搜索准确度）
      for (let len = 2; len <= Math.min(4, chars.length - i); len++) {
        const substr = chars.substring(i, i + len);
        if (substr.trim().length === len) {
          words.push(substr);
        }
      }
    }
    
    return words;
  }

  /**
   * 搜索（使用索引）
   * @param {string} query - 搜索词
   * @returns {Array<number>} - 匹配的项索引数组
   */
  search(query) {
    if (!query || !query.trim()) {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    
    // 直接查找完全匹配
    if (this.index.has(normalizedQuery)) {
      return this.index.get(normalizedQuery);
    }

    // 分词搜索（查找包含所有词的项）
    const queryWords = this.tokenize(normalizedQuery);
    if (queryWords.length === 0) {
      return [];
    }

    // 获取第一个词的结果作为基础
    let results = this.index.get(queryWords[0]) || [];
    
    // 与其他词的结果取交集
    for (let i = 1; i < queryWords.length && results.length > 0; i++) {
      const wordResults = this.index.get(queryWords[i]) || [];
      results = results.filter(idx => wordResults.includes(idx));
    }

    return results;
  }

  /**
   * 增量搜索（基于上次结果过滤）
   * @param {string} newQuery - 新查询
   * @param {string} oldQuery - 旧查询
   * @param {Array<number>} oldResults - 旧结果
   * @returns {Array<number>}
   */
  incrementalSearch(newQuery, oldQuery, oldResults) {
    // 如果新查询是旧查询的扩展，在旧结果中过滤
    if (newQuery.startsWith(oldQuery) && oldResults.length > 0) {
      const normalizedNew = newQuery.toLowerCase();
      return oldResults.filter(idx => {
        const item = this.items[idx];
        return item && item.content.toLowerCase().includes(normalizedNew);
      });
    }
    
    // 否则执行全新搜索
    return this.search(newQuery);
  }

  /**
   * 清空索引
   */
  clear() {
    this.index.clear();
    this.items = [];
  }

  /**
   * 获取索引统计信息
   */
  getStats() {
    return {
      indexSize: this.index.size,
      itemsCount: this.items.length,
      avgIndicesPerWord: this.index.size > 0 
        ? (Array.from(this.index.values()).reduce((sum, arr) => sum + arr.length, 0) / this.index.size).toFixed(2)
        : 0
    };
  }
}

// 创建全局单例
export const searchIndex = new SearchIndex();
export default searchIndex;

