/**
 * 字幕相关事件处理器
 * 负责处理字幕搜索功能
 * 滚动功能已移至 SubtitleScrollManager
 */

import { debounce, throttleRAF } from '../../utils/helpers.js';
import searchIndex from '../../utils/SearchIndex.js';
import logger from '../../utils/DebugLogger.js';

export class SubtitleEventHandler {
  constructor() {
    this.searchMatches = [];
    this.currentMatchIndex = -1;
    this.searchTerm = '';
    this.lastSearchTerm = '';
    this.searchIndexBuilt = false;
    this.subtitleDataCache = null;
    this.currentHighlightedIndex = -1;
    
    // 创建防抖和节流函数
    this.debouncedSearch = debounce(this.performSearch.bind(this), 300);
    this.throttledHighlight = throttleRAF(this.updateHighlight.bind(this));
  }

  /**
   * 初始化搜索索引
   * @param {Array} subtitleData
   */
  initSearchIndex(subtitleData) {
    if (subtitleData && subtitleData.length > 0) {
      searchIndex.buildIndex(subtitleData);
      this.searchIndexBuilt = true;
      this.subtitleDataCache = subtitleData.map((item, index) => ({
        ...item,
        index,
        element: null
      }));
    }
  }

  /**
   * 绑定字幕搜索事件
   * @param {HTMLElement} container
   * @param {HTMLInputElement} searchInput
   */
  bindSearchEvents(container, searchInput) {
    if (!searchInput) return;

    // 输入事件
    searchInput.addEventListener('input', (e) => {
      this.debouncedSearch(container, e.target.value);
    });

    // 回车键跳转下一个
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.navigateToMatch(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.clearSearch(container);
        searchInput.value = '';
      }
    });
  }

  /**
   * 绑定搜索导航事件
   * @param {HTMLElement} prevBtn - 上一个按钮
   * @param {HTMLElement} nextBtn - 下一个按钮
   */
  bindSearchNavigationEvents(prevBtn, nextBtn) {
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.navigateToMatch(-1);
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.navigateToMatch(1);
      });
    }
  }


  /**
   * 执行搜索
   * @param {HTMLElement} container
   * @param {string} searchTerm
   * @private
   */
  performSearch(container, searchTerm) {
    this.searchTerm = searchTerm.trim();

    // 清除之前的高亮
    this.clearSearchHighlights(container);

    if (!this.searchTerm) {
      this.updateSearchInfo(container, 0, 0);
      return;
    }

    // 使用搜索索引
    if (this.searchIndexBuilt) {
      const results = searchIndex.search(this.searchTerm);
      this.searchMatches = results;

      // 高亮匹配项
      results.forEach(index => {
        const item = container.querySelector(`.subtitle-item[data-index="${index}"]`);
        if (item) {
          item.classList.add('search-match');
        }
      });

      // 更新搜索信息
      this.updateSearchInfo(container, results.length, 0);

      // 跳转到第一个匹配
      if (results.length > 0) {
        this.currentMatchIndex = 0;
        this.scrollToMatch(container, results[0]);
      }
    }
  }

  /**
   * 导航到匹配项
   * @param {number} direction - 1为下一个，-1为上一个
   */
  navigateToMatch(direction) {
    if (this.searchMatches.length === 0) return;

    this.currentMatchIndex += direction;
    
    // 循环导航
    if (this.currentMatchIndex >= this.searchMatches.length) {
      this.currentMatchIndex = 0;
    } else if (this.currentMatchIndex < 0) {
      this.currentMatchIndex = this.searchMatches.length - 1;
    }

    const container = document.querySelector('#subtitle-list-container');
    if (container) {
      this.scrollToMatch(container, this.searchMatches[this.currentMatchIndex]);
      this.updateSearchInfo(container, this.searchMatches.length, this.currentMatchIndex + 1);
    }
  }

  /**
   * 滚动到匹配项
   * @private
   */
  scrollToMatch(container, index) {
    const item = container.querySelector(`.subtitle-item[data-index="${index}"]`);
    if (item) {
      // 移除之前的当前匹配高亮
      container.querySelectorAll('.current-match').forEach(el => {
        el.classList.remove('current-match');
      });
      
      // 添加当前匹配高亮
      item.classList.add('current-match');
      
      // 滚动到视图中心
      const itemTop = item.offsetTop;
      const itemHeight = item.offsetHeight;
      const containerHeight = container.clientHeight;
      const targetScrollTop = itemTop - (containerHeight / 2) + (itemHeight / 2);
      
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }

  /**
   * 清除搜索高亮
   * @private
   */
  clearSearchHighlights(container) {
    container.querySelectorAll('.search-match, .current-match').forEach(item => {
      item.classList.remove('search-match', 'current-match');
    });
    this.searchMatches = [];
    this.currentMatchIndex = -1;
  }

  /**
   * 清除搜索
   */
  clearSearch(container) {
    this.searchTerm = '';
    this.clearSearchHighlights(container);
    this.updateSearchInfo(container, 0, 0);
  }

  /**
   * 更新搜索信息显示
   * @private
   */
  updateSearchInfo(container, total, current) {
    const matchCount = container.parentElement?.querySelector('.search-match-count');
    if (matchCount) {
      if (total > 0) {
        matchCount.textContent = `${current}/${total}`;
        matchCount.style.display = 'block';
      } else {
        matchCount.style.display = 'none';
      }
    }
  }

  /**
   * 更新字幕高亮
   * @private
   */
  updateHighlight() {
    const video = document.querySelector('video');
    if (!video || !this.subtitleDataCache) return;

    const currentTime = video.currentTime;
    let targetIndex = -1;

    // 二分查找当前字幕
    let left = 0;
    let right = this.subtitleDataCache.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const item = this.subtitleDataCache[mid];

      if (currentTime >= item.from && currentTime <= item.to) {
        targetIndex = mid;
        break;
      } else if (currentTime < item.from) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // 只在需要更新时更新
    if (targetIndex !== this.currentHighlightedIndex) {
      // 移除旧高亮
      if (this.currentHighlightedIndex >= 0) {
        const oldItem = this.subtitleDataCache[this.currentHighlightedIndex];
        if (oldItem.element) {
          oldItem.element.classList.remove('current');
        }
      }

      // 添加新高亮
      if (targetIndex >= 0) {
        const newItem = this.subtitleDataCache[targetIndex];
        if (!newItem.element) {
          newItem.element = document.querySelector(`.subtitle-item[data-index="${targetIndex}"]`);
        }
        if (newItem.element) {
          newItem.element.classList.add('current');
        }
      }

      this.currentHighlightedIndex = targetIndex;
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    this.searchMatches = [];
    this.currentMatchIndex = -1;
    this.searchTerm = '';
    this.subtitleDataCache = null;
  }
}

export default SubtitleEventHandler;
