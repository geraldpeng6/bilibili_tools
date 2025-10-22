/**
 * 拖拽事件处理器
 * 负责处理字幕面板的拖拽功能
 */

export class DragHandler {
  constructor() {
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.translateX = 0;
    this.translateY = 0;
  }

  /**
   * 绑定拖拽事件
   * @param {HTMLElement} container - 要拖拽的容器
   * @param {HTMLElement} dragHandle - 拖拽手柄元素
   */
  bind(container, dragHandle) {
    if (!container || !dragHandle) return;

    dragHandle.addEventListener('mousedown', (e) => this.handleMouseDown(e, container));
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e, container));
    document.addEventListener('mouseup', () => this.handleMouseUp());
  }

  /**
   * 处理鼠标按下事件
   * @private
   */
  handleMouseDown(e, container) {
    // 如果点击的是按钮或输入框，不触发拖拽
    if (e.target.closest('button, input, textarea, select, a')) {
      return;
    }

    this.isDragging = true;
    this.dragStartX = e.clientX - this.translateX;
    this.dragStartY = e.clientY - this.translateY;
    
    container.style.cursor = 'move';
    container.style.userSelect = 'none';
  }

  /**
   * 处理鼠标移动事件
   * @private
   */
  handleMouseMove(e, container) {
    if (!this.isDragging) return;

    e.preventDefault();
    
    this.translateX = e.clientX - this.dragStartX;
    this.translateY = e.clientY - this.dragStartY;
    
    // 限制拖拽范围
    const rect = container.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    
    this.translateX = Math.max(0, Math.min(this.translateX, maxX));
    this.translateY = Math.max(0, Math.min(this.translateY, maxY));
    
    container.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;
    
    // 保存位置
    this.savePosition(container);
  }

  /**
   * 处理鼠标松开事件
   * @private
   */
  handleMouseUp() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  /**
   * 保存容器位置
   * @private
   */
  savePosition(container) {
    const containerKey = container.id || 'default-container';
    localStorage.setItem(`${containerKey}-position`, JSON.stringify({
      x: this.translateX,
      y: this.translateY
    }));
  }

  /**
   * 恢复容器位置
   * @param {HTMLElement} container
   */
  restorePosition(container) {
    const containerKey = container.id || 'default-container';
    const saved = localStorage.getItem(`${containerKey}-position`);
    
    if (saved) {
      try {
        const position = JSON.parse(saved);
        this.translateX = position.x || 0;
        this.translateY = position.y || 0;
        container.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;
      } catch (e) {
        // Ignore parse error
      }
    }
  }

  /**
   * 重置位置
   */
  reset() {
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.translateX = 0;
    this.translateY = 0;
  }
}

export default DragHandler;
