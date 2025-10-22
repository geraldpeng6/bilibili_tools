/**
 * 样式模块
 * 集中管理所有CSS样式
 */

import { Z_INDEX } from '../constants.js';

export const CSS_STYLES = `
  /* ==================== 小球样式 ==================== */
  #subtitle-ball {
    position: absolute;
    right: -30px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: #999;
    cursor: pointer;
    z-index: ${Z_INDEX.BALL};
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transition: all 0.3s ease;
    animation: breath-ball-normal 2s ease-in-out infinite;
  }

  #subtitle-ball:hover {
    transform: translateY(-50%) scale(1.2);
    box-shadow: 0 3px 10px rgba(0,0,0,0.35);
  }

  #subtitle-ball.active {
    background-color: #feebea;
    cursor: pointer;
  }

  #subtitle-ball.loading {
    background-color: #3b82f6;
    animation: breath-ball 1.2s ease-in-out infinite;
  }

  #subtitle-ball.ai-summarizing {
    background-color: #feebea;
    animation: breath-ball-ai 1s ease-in-out infinite;
  }

  #subtitle-ball.no-subtitle {
    background-color: #999;
    cursor: default;
    opacity: 0.6;
  }

  #subtitle-ball.error {
    background-color: #ff0000;
    cursor: default;
  }

  @keyframes breath-ball-normal {
    0%, 100% { transform: translateY(-50%) scale(1); }
    50% { transform: translateY(-50%) scale(1.05); }
  }

  @keyframes breath-ball {
    0%, 100% { transform: translateY(-50%) scale(1.1); opacity: 1; }
    50% { transform: translateY(-50%) scale(1.4); opacity: 0.6; }
  }

  @keyframes breath-ball-ai {
    0%, 100% { 
      transform: translateY(-50%) scale(1.3); 
      opacity: 1;
      box-shadow: 0 0 20px rgba(254, 235, 234, 0.8);
    }
    50% { 
      transform: translateY(-50%) scale(1.8); 
      opacity: 0.7;
      box-shadow: 0 0 40px rgba(254, 235, 234, 1);
    }
  }

  /* ==================== 字幕容器样式 ==================== */
  #subtitle-container {
    position: absolute;
    top: 10%;
    left: 100%;
    width: 500px;
    min-width: 400px;
    max-width: 800px;
    height: 600px;
    min-height: 400px;
    max-height: 90vh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    color: #fff;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.8;
    display: none;
    flex-direction: column;
    overflow: hidden;
    box-shadow: -4px 0 24px rgba(0,0,0,0.5);
    border: 1px solid rgba(254, 235, 234, 0.2);
    transition: none;
    z-index: ${Z_INDEX.CONTAINER};
    margin-left: 10px;
  }

  #subtitle-container.show {
    display: flex;
  }
  
  /* 调整大小的边缘检测区域 */
  #subtitle-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }
  
  /* 鼠标悬停在边缘时的光标样式 */
  #subtitle-container.resize-n { cursor: n-resize; }
  #subtitle-container.resize-s { cursor: s-resize; }
  #subtitle-container.resize-e { cursor: e-resize; }
  #subtitle-container.resize-w { cursor: w-resize; }
  #subtitle-container.resize-ne { cursor: ne-resize; }
  #subtitle-container.resize-nw { cursor: nw-resize; }
  #subtitle-container.resize-se { cursor: se-resize; }
  #subtitle-container.resize-sw { cursor: sw-resize; }

  /* ==================== 头部样式 ==================== */
  .subtitle-header {
    font-size: 14px;
    font-weight: 500;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
    user-select: none;
    flex-shrink: 0;
    background: linear-gradient(135deg, rgba(254, 235, 234, 0.12), rgba(254, 235, 234, 0.06));
    color: #fff;
    border-radius: 12px 12px 0 0;
    user-select: none;
  }

  .subtitle-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .subtitle-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
    z-index: 10;
  }

  /* AI助手图标 - 删除边框和背景 */

  .subtitle-status-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .subtitle-status-text {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .subtitle-search-box {
    position: relative;
    flex: 1;
    max-width: 300px;
    margin: 0 8px; 
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .subtitle-search-container {
    position: relative;
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 20px;
    padding: 5px 12px;
    border: 1px solid rgba(254, 235, 234, 0.15);
    transition: all 0.2s;
    width: 200px;
  }

  .subtitle-search-container:focus-within {
    border-color: #feebea;
    background: rgba(0, 0, 0, 0.4);
    box-shadow: 0 0 0 2px rgba(254, 235, 234, 0.1);
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 14px;
    padding: 4px;
    padding-right: 70px;
  }

  .search-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .search-controls {
    position: absolute;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .search-counter {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    min-width: 28px;
    text-align: center;
  }

  .search-nav-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 2px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .search-nav-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }

  .search-nav-btn:active {
    transform: scale(0.9);
  }

  .search-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .search-nav-btn svg {
    display: block;
  }

  /* 搜索高亮样式 */
  .search-highlight {
    background-color: rgba(255, 255, 0, 0.4);
    color: #000;
    padding: 2px 0;
    border-radius: 2px;
  }

  .search-highlight-current {
    background-color: rgba(255, 165, 0, 0.6);
    color: #000;
    padding: 2px 0;
    border-radius: 2px;
    box-shadow: 0 0 4px rgba(255, 165, 0, 0.8);
  }

  .subtitle-header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .subtitle-close {
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.5);
    transition: all 0.2s;
    padding: 4px;
    border-radius: 4px;
  }

  .subtitle-close:hover {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.1);
  }

  /* ==================== 标签页样式 ==================== */
  .subtitle-tabs {
    display: flex;
    padding: 0 20px;
    gap: 20px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.1);
    background: rgba(0, 0, 0, 0.2);
  }

  .subtitle-tab {
    position: relative;
    padding: 12px 4px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
  }

  .subtitle-tab:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .subtitle-tab.active {
    color: #fff;
  }

  .subtitle-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #feebea, rgba(254, 235, 234, 0.6));
    border-radius: 2px 2px 0 0;
  }

  /* ==================== 内容区域样式 ==================== */
  .subtitle-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    height: calc(100% - 120px);
  }

  .subtitle-panel {
    padding: 20px;
    height: 100%;
    overflow-y: visible;
  }

  .subtitle-content::-webkit-scrollbar {
    width: 6px;
  }

  .subtitle-content::-webkit-scrollbar-thumb {
    background-color: rgba(254, 235, 234, 0.4);
    border-radius: 3px;
  }
  
  .subtitle-content::-webkit-scrollbar-thumb:hover {
    background-color: rgba(254, 235, 234, 0.6);
  }
  
  .subtitle-content::-webkit-scrollbar-track {
    background-color: rgba(255, 255, 255, 0.05);
  }

  /* ==================== 字幕列表样式 ==================== */
  .subtitle-toggle-btn {
    padding: 8px 12px;
    margin-bottom: 15px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: auto;
  }

  .subtitle-toggle-btn:hover {
    background: rgba(254, 235, 234, 0.2);
    border-color: #feebea;
    transform: scale(1.05);
  }

  .subtitle-toggle-icon {
    transition: transform 0.3s ease;
    display: inline-block;
    font-size: 12px;
  }

  .subtitle-toggle-btn.expanded .subtitle-toggle-icon {
    transform: rotate(90deg);
  }

  .subtitle-list-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: auto;
    overflow-y: visible;
    padding: 16px;
    position: relative;
  }

  .subtitle-item {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
    padding: 6px 10px;
    border-radius: 6px;
    transition: all 0.2s;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(254, 235, 234, 0.2);
    position: relative;
  }

  .subtitle-item:hover {
    background: rgba(254, 235, 234, 0.15);
    border-color: #feebea;
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(254, 235, 234, 0.2);
  }

  .subtitle-item.current {
    background: rgba(254, 235, 234, 0.2) !important;
    border-left: 3px solid #ff69b4;
    padding-left: 9px;
    box-shadow: 0 2px 8px rgba(255, 105, 180, 0.2);
    animation: subtitleHighlight 1.5s ease infinite;
  }
  
  @keyframes subtitleHighlight {
    0%, 100% {
      box-shadow: 0 2px 8px rgba(255, 105, 180, 0.2);
    }
    50% {
      box-shadow: 0 2px 12px rgba(255, 105, 180, 0.4);
    }
  }

  .subtitle-time {
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
    min-width: 42px;
  }

  .subtitle-text {
    color: #e5e7eb;
    font-size: 14px;
    line-height: 1.5;
    flex: 1;
  }

  /* ==================== AI图标样式 ==================== */
  .ai-icon {
    cursor: pointer;
    width: 24px;
    height: 24px;
    opacity: 0.7;
    transition: opacity 0.2s, transform 0.2s;
  }

  .ai-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .ai-icon.loading {
    animation: breath-ai 1.2s ease-in-out infinite;
    pointer-events: none;
  }

  .ai-icon.disabled {
    opacity: 0.3;
    pointer-events: none;
    cursor: not-allowed;
  }

  @keyframes breath-ai {
    0%, 100% { transform: scale(1.05); opacity: 1; }
    50% { transform: scale(1.35); opacity: 0.5; }
  }

  /* ==================== 下载图标样式 ==================== */
  .download-icon {
    cursor: pointer;
    width: 20px;
    height: 20px;
    opacity: 0.7;
    transition: opacity 0.2s, transform 0.2s;
  }

  .download-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  /* ==================== Notion图标样式 ==================== */
  .notion-icon {
    cursor: pointer;
    width: 24px;
    height: 24px;
    opacity: 0.7;
    transition: opacity 0.2s, transform 0.2s;
  }

  .notion-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .notion-icon.loading {
    animation: breath-notion 1.2s ease-in-out infinite;
  }

  @keyframes breath-notion {
    0%, 100% { transform: scale(1.05); opacity: 1; }
    50% { transform: scale(1.35); opacity: 0.5; }
  }

  /* ==================== Toast提示样式 ==================== */
  .notion-toast {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: ${Z_INDEX.TOAST};
    opacity: 0;
    transition: opacity 0.3s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .notion-toast.show {
    opacity: 1;
  }

  /* ==================== AI总结样式 ==================== */
  .ai-summary-tips {
    padding: 10px 16px;
    background: rgba(254, 235, 234, 0.08);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    margin-bottom: 16px;
  }

  .ai-summary-main {
    padding: 16px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    margin-bottom: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  
  .summary-title {
    font-size: 14px;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .summary-content {
    font-size: 14px;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.85);
    overflow-y: visible;
    overflow-x: hidden;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  
  /* 滚动条样式已统一由 .subtitle-content 管理 */
  
  /* Markdown样式 - 总结区域 */
  .summary-content h1,
  .summary-content h2,
  .summary-content h3,
  .summary-content h4,
  .summary-content h5,
  .summary-content h6 {
    color: rgba(255, 255, 255, 0.9) !important;
    margin-top: 12px;
    margin-bottom: 8px;
    font-weight: 600;
  }
  
  .summary-content h1 { font-size: 18px; }
  .summary-content h2 { font-size: 16px; }
  .summary-content h3 { font-size: 15px; }
  .summary-content h4 { font-size: 14px; }
  
  .summary-content p {
    margin: 8px 0;
    color: rgba(255, 255, 255, 0.85);
  }
  
  .summary-content ul,
  .summary-content ol {
    margin: 8px 0;
    padding-left: 20px;
    color: rgba(255, 255, 255, 0.85);
  }
  
  .summary-content li {
    margin: 4px 0;
  }
  
  .summary-content strong {
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
  }
  
  .summary-content code {
    background: rgba(255, 255, 255, 0.1);
    color: #feebea;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 13px;
  }
  
  .summary-content blockquote {
    border-left: 3px solid #feebea;
    background: rgba(254, 235, 234, 0.05);
    padding: 8px 12px;
    margin: 8px 0;
    color: rgba(255, 255, 255, 0.8);
  }

  .ai-summary-outline {
    margin-bottom: 20px;
  }

  .progress-switch {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    margin-bottom: 16px;
    border: 1px solid rgba(254, 235, 234, 0.1);
  }
  
  .progress-switch span {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
  }

  .switch-btn {
    width: 40px;
    height: 22px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 11px;
    position: relative;
    cursor: pointer;
    transition: all 0.3s;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .switch-btn.on {
    background: rgba(254, 235, 234, 0.3);
    border-color: #feebea;
  }

  .switch-block {
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: all 0.3s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .switch-btn.on .switch-block {
    transform: translateX(18px);
  }

  .ai-summary-sections {
    padding: 0;
  }

  .summary-section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: rgba(254, 235, 234, 0.08);
    border-radius: 8px;
    border-left: 3px solid #feebea;
  }

  .section-items {
    padding: 0;
  }

  .section-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    border: 1px solid rgba(254, 235, 234, 0.1);
    margin-bottom: 8px;
    transition: all 0.2s ease;
    position: relative;
    cursor: pointer; /* 添加鼠标指针样式，表示可点击 */
    user-select: none; /* 禁止文字选择，防止与笔记功能冲突 */
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
  
  .section-item:hover {
    background: rgba(254, 235, 234, 0.15);
    border-color: #feebea;
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(254, 235, 234, 0.2); /* 添加阴影效果 */
  }
  
  .section-item:active {
    transform: translateX(2px) scale(0.98); /* 点击时的反馈 */
  }
  
  .section-item.clicked {
    animation: segmentClick 0.3s ease;
  }
  
  @keyframes segmentClick {
    0% {
      transform: scale(1);
      background: rgba(254, 235, 234, 0.05);
    }
    50% {
      transform: scale(0.98);
      background: rgba(254, 235, 234, 0.3);
      box-shadow: 0 0 10px rgba(254, 235, 234, 0.5);
    }
    100% {
      transform: scale(1);
      background: rgba(254, 235, 234, 0.05);
    }
  }
  
  .ai-segments-section .section-item {
    cursor: pointer;
  }
  
  .ai-segments-section .section-item:hover {
    background: rgba(254, 235, 234, 0.2);
  }
  
  .segment-item {
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .segment-item:hover {
    background: rgba(254, 235, 234, 0.1);
    transform: translateX(2px);
  }

  .time-btn {
    padding: 2px 6px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
    min-width: 42px;
    text-align: left;
  }

  .time-btn:hover {
    color: #feebea;
  }

  .item-content {
    flex: 1;
    color: #e5e7eb;
    font-size: 14px;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-title {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .item-desc {
    font-size: 12px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.65);
  }
  
  .item-single {
    font-size: 14px;
    color: #e5e7eb;
  }

  .ai-segments-section,
  .original-subtitles-section,
  .ai-segments-in-summary {
    margin-bottom: 12px;
  }
  
  .summary-panel-container {
    height: auto;
    overflow-y: visible;
    overflow-x: hidden;
    padding: 12px;
  }
  
  /* 滚动条样式已移到 .subtitle-content */
  
  .ai-segments-in-summary {
    background: #2a2a2a;
    border-radius: 8px;
    padding: 8px;
  }

  .segments-header {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    padding: 8px 12px;
    margin-bottom: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .segments-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 16px 0;
  }

  .ai-summary-main {
    padding-top: 8px;
  }

  .ai-summary-empty {
    padding: 60px 20px;
    text-align: center;
    color: rgba(255, 255, 255, 0.4);
    font-size: 14px;
  }

  .ai-summary-content {
    color: #e5e7eb;
    font-size: 14px;
    line-height: 1.7;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
    white-space: normal;
    max-width: 100%;
  }

  .ai-summary-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: rgba(255, 255, 255, 0.6);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(254, 235, 234, 0.1);
    border-top-color: #feebea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ==================== Markdown样式 ==================== */
  .ai-summary-content h1,
  .ai-summary-content h2,
  .ai-summary-content h3 {
    color: #fff;
    margin-top: 12px;
    margin-bottom: 8px;
    font-weight: 700;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .ai-summary-content h1 { font-size: 17px; }
  .ai-summary-content h2 { font-size: 16px; }
  .ai-summary-content h3 { font-size: 15px; }

  .ai-summary-content ul,
  .ai-summary-content ol {
    margin: 8px 0;
    padding-left: 20px;
    max-width: 100%;
  }

  .ai-summary-content li {
    margin: 4px 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .ai-summary-content p {
    margin: 8px 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
    white-space: normal;
  }

  .ai-summary-content code {
    background: rgba(255, 255, 255, 0.1);
    color: #feebea;
    padding: 3px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .ai-summary-content pre {
    background: rgba(0, 0, 0, 0.5);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 10px 0;
    border: 1px solid rgba(254, 235, 234, 0.2);
    white-space: pre-wrap;
    word-wrap: break-word;
    max-width: 100%;
  }

  .ai-summary-content pre code {
    background-color: transparent;
    padding: 0;
    border: none;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .ai-summary-content blockquote {
    border-left: 4px solid #feebea;
    background: rgba(254, 235, 234, 0.1);
    padding: 12px;
    padding-left: 16px;
    margin: 10px 0;
    border-radius: 4px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .ai-summary-content strong {
    color: #fff;
    font-weight: 700;
  }

  .ai-summary-content a {
    color: #feebea;
    text-decoration: underline;
    font-weight: 600;
  }
  
  .ai-summary-content a:hover {
    color: #fff;
  }

  /* ==================== 配置模态框样式 ==================== */
  .config-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: ${Z_INDEX.AI_MODAL};
    display: none;
    align-items: center;
    justify-content: center;
  }

  .config-modal.show {
    display: flex;
  }
  
  /* 配置模态框overlay样式（用于快捷键配置等） */
  .config-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: ${Z_INDEX.AI_MODAL};
    display: none;
    align-items: center;
    justify-content: center;
  }
  
  .config-modal-overlay.show {
    display: flex;
  }
  
  /* 快捷键配置模态框 */
  #shortcut-config-modal {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    padding: 0;
    width: 600px;
    max-width: 90%;
    max-height: 85vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    color: #fff;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .config-modal-content {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    padding: 0;
    width: 700px;
    max-width: 90%;
    max-height: 85vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    color: #fff;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .config-modal-header {
    padding: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(254, 235, 234, 0.15);
    border-bottom: 1px solid rgba(254, 235, 234, 0.2);
    border-radius: 16px 16px 0 0;
  }
  
  .config-modal-title {
    font-size: 20px;
    font-weight: 700;
    color: white;
  }
  
  .config-modal-close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .config-modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }
  
  .config-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 30px;
    background-color: transparent;
  }

  .config-field {
    margin-bottom: 20px;
  }

  .config-field label {
    display: block;
    margin-bottom: 10px;
    font-weight: 600;
    color: #e5e7eb;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .config-field label::before {
    content: '•';
    color: #feebea;
    font-size: 18px;
    font-weight: bold;
  }

  .config-field input,
  .config-field textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 10px;
    font-size: 14px;
    box-sizing: border-box;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .config-field input:hover,
  .config-field textarea:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(254, 235, 234, 0.5);
  }

  .config-field input:focus,
  .config-field textarea:focus {
    outline: none;
    border-color: #feebea;
    box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    background: rgba(255, 255, 255, 0.15);
  }

  .config-field input::placeholder,
  .config-field textarea::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .config-field textarea {
    font-family: inherit;
    resize: vertical;
    min-height: 120px;
    line-height: 1.6;
  }
  
  .config-field input[type="checkbox"] {
    width: auto;
    margin-right: 8px;
    cursor: pointer;
  }

  .config-help {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 5px;
  }

  .config-help a {
    color: #feebea;
    text-decoration: underline;
  }

  .config-help code {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #fff;
  }

  .config-help strong {
    color: #feebea;
  }

  .config-footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding: 20px 30px;
    background-color: rgba(0, 0, 0, 0.3);
    border-top: 1px solid rgba(254, 235, 234, 0.2);
    border-radius: 0 0 16px 16px;
  }

  .config-btn {
    padding: 12px 24px;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }

  .config-btn::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
  }

  .config-btn:hover::before {
    width: 300px;
    height: 300px;
  }

  .config-btn-primary {
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: #fff;
    box-shadow: 0 4px 12px rgba(254, 235, 234, 0.3);
  }

  .config-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(254, 235, 234, 0.4);
  }

  .config-btn-primary:active {
    transform: translateY(0);
  }

  .config-btn-secondary {
    background-color: #f3f4f6;
    color: #6b7280;
    border: 2px solid #e5e7eb;
  }

  .config-btn-secondary:hover {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }

  .config-btn-danger {
    background-color: #fee2e2;
    color: #dc2626;
    border: 2px solid #fecaca;
  }

  .config-btn-danger:hover {
    background-color: #dc2626;
    color: white;
    border-color: #dc2626;
  }

  .config-status {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    margin-top: 10px;
  }

  .config-status.success {
    background-color: #d4edda;
    color: #155724;
  }

  .config-status.error {
    background-color: #f8d7da;
    color: #721c24;
  }

  /* ==================== AI配置列表样式 ==================== */
  .ai-config-list {
    margin-bottom: 25px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .ai-config-item {
    padding: 10px 14px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 10px;
    margin-bottom: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(255, 255, 255, 0.05);
    position: relative;
    overflow: hidden;
  }

  .ai-config-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: 4px;
    background: linear-gradient(135deg, #feebea 0%, #ffdbdb 100%);
    transform: scaleY(0);
    transition: transform 0.3s ease;
  }

  .ai-config-item:hover {
    background: rgba(254, 235, 234, 0.15);
    border-color: #feebea;
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(254, 235, 234, 0.2);
  }

  .ai-config-item:hover::before {
    transform: scaleY(1);
  }

  .ai-config-item.selected {
    border-color: #feebea;
    background: rgba(254, 235, 234, 0.2);
    box-shadow: 0 4px 16px rgba(254, 235, 234, 0.3);
  }

  .ai-config-item.selected::before {
    transform: scaleY(1);
    width: 4px;
  }

  .ai-config-item-name {
    font-weight: 600;
    font-size: 14px;
    color: #e5e7eb;
  }

  .ai-config-item.selected .ai-config-item-name {
    color: #fff;
    font-weight: 700;
  }

  .ai-config-item-actions {
    display: flex;
    gap: 8px;
    z-index: 1;
  }

  .ai-config-btn-small {
    padding: 4px 12px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .ai-config-btn-small:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }

  .ai-config-btn-small.config-btn-primary {
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: white;
  }

  .ai-config-btn-small.config-btn-secondary {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  .ai-config-btn-small.config-btn-secondary:hover {
    background-color: #fee2e2;
    color: #dc2626;
  }

  .ai-config-form {
    border-top: 1px solid rgba(254, 235, 234, 0.2);
    padding-top: 25px;
    margin-top: 10px;
    background: rgba(0, 0, 0, 0.3);
    padding: 25px;
    border-radius: 12px;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .ai-config-form.hidden {
    display: none;
  }

  .ai-config-form .config-field {
    margin-bottom: 20px;
  }

  /* ==================== 模型选择器样式 ==================== */
  .model-select-wrapper {
    margin-top: 8px;
    position: relative;
  }

  .model-search-input {
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .model-search-input:focus {
    outline: none;
    border-color: #feebea;
    box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    background: rgba(255, 255, 255, 0.15);
  }

  .model-search-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .model-select-wrapper select {
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
    max-height: 200px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .model-select-wrapper select option {
    padding: 8px;
    background: rgba(0, 0, 0, 0.9);
    color: #fff;
  }

  .model-count-badge {
    display: inline-block;
    background: #feebea;
    color: #1a1a1a;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    margin-left: 8px;
    font-weight: 600;
  }

  .model-field-with-button {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .model-field-with-button input {
    flex: 1;
  }

  .fetch-models-btn {
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: white;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(254, 235, 234, 0.3);
  }

  .fetch-models-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(254, 235, 234, 0.4);
  }

  .fetch-models-btn:active {
    transform: translateY(0);
  }

  .fetch-models-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none;
  }

  /* ==================== 速度控制样式 ==================== */
  .speed-control-section {
    padding: 12px;
    margin-bottom: 15px;
    background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%);
    border-radius: 12px;
    border: 2px solid rgba(254, 235, 234, 0.5);
  }

  .speed-control-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 2px solid rgba(254, 235, 234, 0.5);
  }

  .speed-control-title {
    font-size: 14px;
    font-weight: 700;
    color: #2d2d2d;
  }

  .speed-control-display {
    font-size: 16px;
    font-weight: 700;
    color: #1a1a1a;
    font-family: monospace;
  }

  .speed-control-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .speed-btn {
    flex: 1;
    padding: 8px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #1a1a1a;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .speed-btn:hover {
    background: #feebea;
    border-color: #feebea;
    transform: translateY(-1px);
  }

  .speed-btn-small {
    flex: 0 0 40px;
    font-size: 18px;
  }

  .speed-control-advanced {
    margin-top: 8px;
  }

  .speed-toggle-volume-btn {
    width: 100%;
    padding: 8px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #6b7280;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .speed-toggle-volume-btn:hover {
    background: #fff5f5;
    border-color: #ffe5e5;
  }

  /* ==================== 快捷键配置面板样式 ==================== */

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .shortcut-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .shortcut-description {
    flex: 1;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
  }

  .shortcut-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .shortcut-input {
    padding: 6px 12px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 6px;
    font-size: 13px;
    min-width: 180px;
    text-align: center;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
  }

  .shortcut-input:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(254, 235, 234, 0.5);
  }

  .shortcut-input.recording,
  .shortcut-input.capturing {
    background: rgba(254, 235, 234, 0.2);
    border-color: #feebea;
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(254, 235, 234, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(254, 235, 234, 0); }
    100% { box-shadow: 0 0 0 0 rgba(254, 235, 234, 0); }
  }

  .shortcut-reset-btn {
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .shortcut-reset-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
  }

  .shortcut-config-footer {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .shortcut-tips {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .shortcuts-icon {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    transition: all 0.2s;
  }

  .shortcuts-icon:hover {
    transform: rotate(45deg);
    filter: drop-shadow(0 0 8px rgba(254, 235, 234, 0.5));
  }

  /* ==================== 笔记面板样式 ==================== */
  .notes-panel {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    width: 400px;
    min-width: 350px;
    max-width: 600px;
    height: 600px;
    min-height: 400px;
    max-height: 80vh;
    background: rgba(32, 32, 38, 0.95);
    backdrop-filter: blur(20px) saturate(200%);
    border-radius: 16px;
    box-shadow: 
      0 20px 60px -8px rgba(255, 105, 180, 0.2),
      0 8px 24px -4px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      inset 0 -1px 0 rgba(0, 0, 0, 0.2);
    resize: both;
    overflow: hidden;  /* 改为 hidden，只允许内部 body 滚动 */
    z-index: ${Z_INDEX.MODAL};
    display: none;
    flex-direction: column;
  }

  .notes-panel.show {
    display: flex;
  }

  .notes-panel-content {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .notes-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.2);
    background: rgba(254, 235, 234, 0.15);
  }

  .notes-panel-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #fff;
  }

  .notes-panel-close {
    background: none;
    border: none;
    font-size: 24px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .notes-panel-close:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  /* 笔记筛选器样式 */
  .notes-filters {
    display: flex;
    gap: 20px;
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  .filter-checkbox input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #feebea;
  }

  .filter-checkbox span {
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
  }

  .filter-checkbox:hover span {
    color: rgba(255, 255, 255, 0.95);
  }

  .notes-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .notes-panel-body::-webkit-scrollbar {
    width: 6px;
  }

  .notes-panel-body::-webkit-scrollbar-thumb {
    background-color: rgba(254, 235, 234, 0.4);
    border-radius: 3px;
  }
  
  .notes-panel-body::-webkit-scrollbar-thumb:hover {
    background-color: rgba(254, 235, 234, 0.6);
  }
  
  .notes-panel-body::-webkit-scrollbar-track {
    background-color: rgba(255, 255, 255, 0.05);
  }

  .notes-empty-state {
    text-align: center;
    padding: 60px 20px;
    color: rgba(255, 255, 255, 0.6);
  }

  .notes-empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .notes-empty-hint {
    font-size: 14px;
    margin-top: 8px;
  }

  .note-group {
    margin-bottom: 24px;
  }

  .note-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.2);
  }

  .note-group-title {
    font-size: 14px;
    font-weight: 600;
    color: #e5e7eb;
  }

  .note-group-actions {
    display: flex;
    gap: 8px;
  }

  .note-group-copy-btn,
  .note-group-delete-btn {
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
    border: 1px solid;
  }

  .note-group-copy-btn {
    background: none;
    border-color: #4A90E2;
    color: #4A90E2;
  }

  .note-group-copy-btn:hover {
    background: #4A90E2;
    color: white;
  }

  .note-group-delete-btn {
    background: none;
    border-color: #e74c3c;
    color: #e74c3c;
  }

  .note-group-delete-btn:hover {
    background: #e74c3c;
    color: white;
  }

  .note-item {
    background: rgba(255, 255, 255, 0.05);
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 8px;
    transition: background-color 0.2s;
    border: 1px solid rgba(254, 235, 234, 0.1);
  }

  .note-item:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(254, 235, 234, 0.3);
  }

  .note-content {
    color: #e5e7eb;
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 8px;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .note-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .note-time {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .note-actions {
    display: flex;
    gap: 8px;
  }

  .note-copy-btn,
  .note-delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 8px;
    transition: color 0.2s;
  }

  .note-copy-btn {
    color: #4A90E2;
  }

  .note-copy-btn:hover {
    color: #357ABD;
  }

  .note-delete-btn {
    color: #e74c3c;
  }

  .note-delete-btn:hover {
    color: #c0392b;
  }

  /* ==================== 笔记选择保存点样式 ==================== */
  #note-saver-blue-dot {
    position: absolute;
    cursor: pointer;
    z-index: 2147483647; /* Maximum z-index */
    display: none;
    transition: transform 0.2s, filter 0.2s;
    pointer-events: auto !important;
    width: 24px;
    height: 24px;
  }

  #note-saver-blue-dot:hover {
    transform: scale(1.15);
    filter: drop-shadow(0 2px 4px rgba(254, 235, 234, 0.5));
  }

  /* ==================== 字幕项保存按钮样式 ==================== */
  .save-subtitle-note-btn {
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: white;
    border: none;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    opacity: 0;
    flex-shrink: 0;
    margin-left: auto;
  }

  .subtitle-item:hover .save-subtitle-note-btn {
    opacity: 1;
  }

  .save-subtitle-note-btn:hover {
    transform: scale(1.05);
  }
  
  .subtitle-follow-btn {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 12px;
    background: rgba(255, 105, 180, 0.8);
    color: white;
    border: none;
    border-radius: 16px;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: all 0.3s;
    z-index: 10;
  }

  .subtitle-follow-btn:hover {
    background: rgba(255, 105, 180, 1);
    transform: translateX(-50%) translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  /* ==================== 快捷键配置样式 ==================== */
  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .shortcut-label {
    font-size: 14px;
    color: #e5e7eb;
    font-weight: 500;
  }

  .shortcut-input-wrapper {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .shortcut-input {
    padding: 6px 12px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 6px;
    font-size: 13px;
    min-width: 180px;
    text-align: center;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
  }

  .shortcut-input:focus {
    outline: none;
    border-color: #feebea;
    box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    background: rgba(255, 255, 255, 0.15);
  }

  .shortcut-input.capturing {
    border-color: #feebea;
    background: rgba(254, 235, 234, 0.2);
    animation: pulse-border 1s infinite;
  }

  @keyframes pulse-border {
    0%, 100% {
      border-color: #feebea;
      box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    }
    50% {
      border-color: #ffc9c9;
      box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.3);
    }
  }

  .shortcut-clear-btn {
    background: none;
    border: none;
    color: #999;
    font-size: 18px;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .shortcut-clear-btn:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  /* ==================== 调整大小手柄样式 ==================== */
  .subtitle-resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    cursor: nwse-resize;
    z-index: 10;
  }

  .subtitle-resize-handle::after {
    content: '';
    position: absolute;
    bottom: 4px;
    right: 4px;
    width: 12px;
    height: 12px;
    border-right: 3px solid rgba(254, 235, 234, 0.6);
    border-bottom: 3px solid rgba(254, 235, 234, 0.6);
    border-radius: 0 0 4px 0;
  }

  .subtitle-resize-handle:hover::after {
    border-color: #feebea;
  }

  .sponsor-switch {
    position: relative;
    width: 48px;
    height: 24px;
  }

  .sponsor-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .sponsor-switch-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #cbd5e1;
    transition: 0.3s;
    border-radius: 24px;
  }

  .sponsor-switch-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  .sponsor-switch input:checked + .sponsor-switch-slider {
    background-color: #feebea;
  }

  .sponsor-switch input:checked + .sponsor-switch-slider:before {
    transform: translateX(24px);
  }

  /* ==================== SponsorBlock 标签样式 ==================== */
  .bili-quality-tag, .bili-ad-tag {
    display: inline-flex !important;
    align-items: center;
    color: white !important;
    padding: 3px 10px !important;
    border-radius: 15px !important;
    margin-right: 6px !important;
    font-size: 12px !important;
    animation: badgeSlideIn 0.3s ease-out !important;
    position: relative;
    z-index: 2;
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  /* 只显示emoji的标签样式 */
  .bili-quality-tag.emoji-only,
  .bili-ad-tag.emoji-only {
    padding: 3px 8px !important;
    min-width: auto;
  }

  /* 视频卡片标签位置 */
  .video-page-card-small .bili-quality-tag,
  .video-page-card-small .bili-ad-tag,
  .bili-video-card__wrap .bili-quality-tag,
  .bili-video-card__wrap .bili-ad-tag {
    position: absolute;
    left: 8px;
    top: 8px;
    transform: scale(0.9);
  }

  /* UP主主页视频卡片 */
  .up-main-video-card .bili-quality-tag,
  .up-main-video-card .bili-ad-tag,
  .small-item .bili-quality-tag,
  .small-item .bili-ad-tag {
    position: absolute !important;
    left: 8px !important;
    top: 8px !important;
    z-index: 10 !important;
    transform: scale(0.9);
  }

  .up-main-video-card .cover-container,
  .up-main-video-card .cover,
  .small-item .cover {
    position: relative !important;
  }

  /* 多标签容器 */
  .bili-tags-container {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    overflow: visible;
    align-items: center;
  }

  @keyframes badgeSlideIn {
    0% { opacity: 0; transform: translateX(-15px) scale(0.9); }
    100% { opacity: 1; transform: translateX(0) scale(0.9); }
  }

  /* 跳过提示Toast - 视频右下角，绿色 */
  .skip-toast {
    position: absolute;
    bottom: 60px;
    right: 20px;
    background: rgba(0, 212, 0, 0.15);
    color: #00d400;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
    font-weight: 500;
    backdrop-filter: blur(4px);
    pointer-events: auto !important;
    user-select: none;
  }

  .skip-toast.hiding {
    animation: fadeOut 0.3s ease-out forwards;
  }

  /* 手动跳过提示 - 视频右下角 */
  .skip-prompt {
    position: absolute;
    bottom: 80px;
    right: 20px;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    border-radius: 8px;
    padding: 12px 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    z-index: 10000;
    min-width: 280px;
    animation: fadeIn 0.3s ease-out;
    pointer-events: auto !important;
    user-select: none;
  }

  .skip-prompt-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 14px;
    font-weight: 500;
  }

  .skip-prompt-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .skip-prompt-icon svg {
    width: 100%;
    height: 100%;
  }

  .skip-prompt-message {
    flex: 1;
  }

  .skip-prompt-buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .skip-prompt-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .skip-prompt-btn-primary {
    background: #00a1d6;
    color: white;
  }

  .skip-prompt-btn-primary:hover {
    background: #0087b3;
  }

  .skip-prompt-btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .skip-prompt-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .skip-prompt-close {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
  }

  .skip-prompt-close:hover {
    color: white;
  }

  .skip-prompt.hiding {
    animation: fadeOut 0.3s ease-out forwards;
  }

  /* 进度条片段标记 */
  #sponsorblock-preview-bar {
    overflow: hidden;
    padding: 0;
    margin: 0;
    position: absolute;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }

  .sponsorblock-segment {
    display: inline-block;
    height: 100%;
    position: absolute;
    min-width: 1px;
    opacity: 0.7;
    transition: all 0.2s ease;
    pointer-events: auto;
    cursor: pointer;
  }

  .sponsorblock-segment:hover {
    opacity: 0.95;
    transform: scaleY(1.5);
    z-index: 100;
  }

  /* 片段详情弹窗 */
  .segment-details-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.95);
    color: white;
    border-radius: 12px;
    padding: 24px;
    min-width: 350px;
    max-width: 500px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    z-index: 10002;
    animation: popupFadeIn 0.2s ease-out;
  }

  @keyframes popupFadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -45%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  .segment-details-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.2);
  }

  .segment-details-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 500;
  }

  .segment-details-close {
    background: none;
    border: none;
    color: #999;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .segment-details-close:hover {
    background: rgba(255,255,255,0.1);
    color: white;
  }

  .segment-details-content {
    margin-bottom: 16px;
  }

  .segment-details-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 14px;
  }

  .segment-details-label {
    color: #999;
  }

  .segment-details-value {
    color: white;
    font-weight: 500;
  }

  .segment-details-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .segment-details-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .segment-details-btn-primary {
    background: #00a1d6;
    color: white;
  }

  .segment-details-btn-primary:hover {
    background: #0087b3;
  }

  .segment-details-btn-secondary {
    background: rgba(255,255,255,0.1);
    color: white;
  }

  .segment-details-btn-secondary:hover {
    background: rgba(255,255,255,0.2);
  }

  .segment-details-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.3);
    z-index: 10001;
  }

  /* SponsorBlock 设置面板样式 */
  .sponsor-settings-section {
    margin-bottom: 24px;
  }

  .sponsor-settings-section h3 {
    font-size: 16px;
    color: #e5e7eb;
    margin: 0 0 12px 0;
  }

  .sponsor-checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sponsor-checkbox-item {
    display: flex;
    align-items: center;
    padding: 8px;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .sponsor-checkbox-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .sponsor-checkbox-item input[type="checkbox"] {
    margin-right: 10px;
    cursor: pointer;
    width: 18px;
    height: 18px;
  }

  .sponsor-checkbox-item label {
    cursor: pointer;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #e5e7eb;
  }

  .category-color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }

  .sponsor-switch-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(254, 235, 234, 0.2);
    margin-bottom: 8px;
    color: #e5e7eb;
  }
`;

/**
 * 注入样式到页面
 */
export function injectStyles() {
  const style = document.createElement('style');
  style.textContent = CSS_STYLES;
  document.head.appendChild(style);
}

// SVG图标
export const ICONS = {
  AI: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 21L12 12L12.2 6.2L11 5M15 4V2M15 16V14M8 9H10M20 9H22M17.8 11.8L19 13M17.8 6.2L19 5" stroke="#feebea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="1.5" fill="#feebea"/>
    <path d="M17 7L12 12L7 7" stroke="#feebea" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  </svg>`,
  
  AI_ASSISTANT: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g opacity="0.8">
      <circle cx="12" cy="15" r="6" fill="#feebea" opacity="0.3"/>
      <path d="M12 5C7.5 5 4 8 4 12c0 3.5 2.5 6.5 6 7.5" stroke="#feebea" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M12 5C16.5 5 20 8 20 12c0 3.5-2.5 6.5-6 7.5" stroke="#feebea" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="8" cy="10" r="1" fill="#feebea"/>
      <circle cx="16" cy="10" r="1" fill="#feebea"/>
      <path d="M8 14c1 1 2 1.5 4 1.5s3-0.5 4-1.5" stroke="#feebea" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M7 3L9 5" stroke="#feebea" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M17 3L15 5" stroke="#feebea" stroke-width="1.5" stroke-linecap="round"/>
    </g>
  </svg>`,
  
  DOWNLOAD: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3V16M12 16L7 11M12 16L17 11" stroke="#feebea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 17V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V17" stroke="#feebea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  NOTION: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z" fill="#fff"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.724 0.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257 -3.89c5.433 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.143c-4.273 -3.107 -6.02 -3.5 -12.817 -2.917zM25.92 19.523c-5.247 0.353 -6.437 0.433 -9.417 -1.99L8.927 11.507c-0.77 -0.78 -0.383 -1.753 1.557 -1.947l53.193 -3.887c4.467 -0.39 6.793 1.167 8.54 2.527l9.123 6.61c0.39 0.197 1.36 1.36 0.193 1.36l-54.933 3.307 -0.68 0.047zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 22.78c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.67 -3.883 4.863l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.083zm59.6 -54.827c0.387 1.75 0 3.5 -1.75 3.7l-2.91 0.577v42.773c-2.527 1.36 -4.853 2.137 -6.797 2.137 -3.107 0 -3.883 -0.973 -6.21 -3.887l-19.03 -29.94v28.967l6.02 1.363s0 3.5 -4.857 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97v-38.3L30.48 40.667c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 19.8 30.327v-26.83l-5.047 -0.58c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.4 -0.78z" fill="#000"/>
  </svg>`,
  
  PEN: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.7 5.2c.4.4.4 1.1 0 1.6l-1 1-3.3-3.3 1-1c.4-.4 1.1-.4 1.6 0l1.7 1.7zm-3.3 2.3L6.7 18.2c-.2.2-.4.3-.7.3H3c-.6 0-1-.4-1-1v-3c0-.3.1-.5.3-.7L13 3.1l3.3 3.3z" stroke="#feebea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="#feebea"/>
  </svg>`
};

