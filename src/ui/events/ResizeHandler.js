/**
 * 调整大小事件处理器
 * 负责处理容器的边缘调整大小功能
 */

export class ResizeHandler {
  constructor() {
    this.isResizing = false;
    this.resizeDirection = null;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.resizeStartWidth = 0;
    this.resizeStartHeight = 0;
    this.resizeStartLeft = 0;
    this.resizeStartTop = 0;
    
    this.minWidth = 400;
    this.minHeight = 300;
    this.maxWidthRatio = 0.8; // 最大宽度为视窗的80%
    this.maxHeightRatio = 0.9; // 最大高度为视窗的90%
    this.edgeSize = 8; // 边缘检测大小
  }

  /**
   * 绑定调整大小事件
   * @param {HTMLElement} container
   */
  bind(container) {
    if (!container) return;

    container.addEventListener('mousemove', (e) => this.handleMouseMove(e, container));
    container.addEventListener('mousedown', (e) => this.handleMouseDown(e, container));
    document.addEventListener('mousemove', (e) => this.handleDocumentMouseMove(e, container));
    document.addEventListener('mouseup', () => this.handleMouseUp(container));
  }

  /**
   * 获取调整方向
   * @private
   */
  getResizeDirection(e, container) {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    
    // 检查是否在头部区域（不触发resize）
    if (y < 40) return null;
    
    let direction = '';
    
    // 垂直方向
    if (y < this.edgeSize) direction += 'n';
    else if (y > h - this.edgeSize) direction += 's';
    
    // 水平方向
    if (x < this.edgeSize) direction += 'w';
    else if (x > w - this.edgeSize) direction += 'e';
    
    return direction || null;
  }

  /**
   * 处理容器内鼠标移动（显示调整光标）
   * @private
   */
  handleMouseMove(e, container) {
    if (this.isResizing) return;
    
    const direction = this.getResizeDirection(e, container);
    this.updateCursor(container, direction);
  }

  /**
   * 处理鼠标按下事件
   * @private
   */
  handleMouseDown(e, container) {
    const direction = this.getResizeDirection(e, container);
    if (!direction) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    this.isResizing = true;
    this.resizeDirection = direction;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    
    const rect = container.getBoundingClientRect();
    this.resizeStartWidth = rect.width;
    this.resizeStartHeight = rect.height;
    this.resizeStartLeft = container.offsetLeft;
    this.resizeStartTop = container.offsetTop;
  }

  /**
   * 处理文档级鼠标移动（执行调整）
   * @private
   */
  handleDocumentMouseMove(e, container) {
    if (!this.isResizing) return;
    
    e.preventDefault();
    
    const deltaX = e.clientX - this.resizeStartX;
    const deltaY = e.clientY - this.resizeStartY;
    
    let newWidth = this.resizeStartWidth;
    let newHeight = this.resizeStartHeight;
    let newLeft = this.resizeStartLeft;
    let newTop = this.resizeStartTop;
    
    // 根据方向调整大小
    if (this.resizeDirection.includes('e')) {
      newWidth = this.resizeStartWidth + deltaX;
    }
    if (this.resizeDirection.includes('w')) {
      newWidth = this.resizeStartWidth - deltaX;
      newLeft = this.resizeStartLeft + deltaX;
    }
    if (this.resizeDirection.includes('s')) {
      newHeight = this.resizeStartHeight + deltaY;
    }
    if (this.resizeDirection.includes('n')) {
      newHeight = this.resizeStartHeight - deltaY;
      newTop = this.resizeStartTop + deltaY;
    }
    
    // 应用限制
    const maxWidth = window.innerWidth * this.maxWidthRatio;
    const maxHeight = window.innerHeight * this.maxHeightRatio;
    
    newWidth = Math.max(this.minWidth, Math.min(newWidth, maxWidth));
    newHeight = Math.max(this.minHeight, Math.min(newHeight, maxHeight));
    
    // 防止超出屏幕
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - newWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - newHeight));
    
    // 应用新尺寸和位置
    container.style.width = `${newWidth}px`;
    container.style.height = `${newHeight}px`;
    container.style.left = `${newLeft}px`;
    container.style.top = `${newTop}px`;
    
    // 保存尺寸
    this.saveSize(container);
  }

  /**
   * 处理鼠标松开事件
   * @private
   */
  handleMouseUp(container) {
    if (!this.isResizing) return;
    
    this.isResizing = false;
    this.resizeDirection = null;
    this.updateCursor(container, null);
  }

  /**
   * 更新光标样式
   * @private
   */
  updateCursor(container, direction) {
    const cursorMap = {
      'n': 'n-resize',
      's': 's-resize',
      'e': 'e-resize',
      'w': 'w-resize',
      'ne': 'ne-resize',
      'nw': 'nw-resize',
      'se': 'se-resize',
      'sw': 'sw-resize'
    };
    
    // 移除所有resize光标类
    Object.values(cursorMap).forEach(cursor => {
      container.classList.remove(`cursor-${cursor}`);
    });
    
    if (direction && cursorMap[direction]) {
      container.classList.add(`cursor-${cursorMap[direction]}`);
    }
  }

  /**
   * 保存容器尺寸
   * @private
   */
  saveSize(container) {
    const containerKey = container.id || 'default-container';
    localStorage.setItem(`${containerKey}-size`, JSON.stringify({
      width: container.style.width,
      height: container.style.height,
      left: container.style.left,
      top: container.style.top
    }));
  }

  /**
   * 恢复容器尺寸
   * @param {HTMLElement} container
   */
  restoreSize(container) {
    const containerKey = container.id || 'default-container';
    const saved = localStorage.getItem(`${containerKey}-size`);
    
    if (saved) {
      try {
        const size = JSON.parse(saved);
        if (size.width) container.style.width = size.width;
        if (size.height) container.style.height = size.height;
        if (size.left) container.style.left = size.left;
        if (size.top) container.style.top = size.top;
      } catch (e) {
        // Ignore parse error
      }
    }
  }

  /**
   * 重置到默认位置和大小
   * @param {HTMLElement} container
   */
  resetToDefault(container) {
    container.style.width = '500px';
    container.style.height = '600px';
    container.style.top = '10%';
    container.style.left = '100%';
    container.style.transform = 'translateX(calc(-100% - 20px))';
    
    this.saveSize(container);
  }
}

export default ResizeHandler;
