(function(global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? (module.exports = factory())
    : typeof define === 'function' && define.amd
      ? define(factory)
      : (global.CanvasFreeDrawing = factory());
})(this, function() {
  'use strict';

  class CanvasFreeDrawing {
    constructor(params = {}) {
      const {
        elementId = this.requiredParam('elementId'),
        width = this.requiredParam('width'),
        height = this.requiredParam('height'),
        lineWidth,
        strokeColor,
        disabled,
      } = params;

      this.elementId = elementId;
      this.canvas = document.getElementById(this.elementId);
      this.checkCanvasElement();
      this.context = this.canvas.getContext('2d', { alpha: false });
      this.width = width;
      this.height = height;

      this.isDrawing = false;
      this.lineWidth = lineWidth || 5;
      this.bucketToolTolerance = 0;
      this.lastPath = null;
      this.imageRestored = false;
      this.positions = [];
      this.leftCanvasDrawing = false; // to check if user left the canvas drawing, on mouseover resume drawing
      this.selectedBucket = false;
      this.allowedEvents = ['redraw', 'mouseup', 'mousedown', 'mouseenter', 'mouseleave'];
      this.isCursorHidden = false;
      this.strokeColor = this.validateColor(strokeColor, true);
      this.bucketToolColor = this.validateColor(strokeColor, true);

      // initialize events
      this.redrawEvent = new Event('cfd_redraw');
      this.mouseUpEvent = new Event('cfd_mouseup');
      this.mouseDownEvent = new Event('cfd_mousedown');
      this.mouseEnterEvent = new Event('cfd_mouseenter');
      this.mouseLeaveEvent = new Event('cfd_mouseleave');

      // these are needed to remove the listener
      this.mouseDown = this.mouseDown.bind(this);
      this.mouseMove = this.mouseMove.bind(this);
      this.mouseLeave = this.mouseLeave.bind(this);
      this.mouseUp = this.mouseUp.bind(this);
      this.mouseUpDocument = this.mouseUpDocument.bind(this);

      this.setDimensions();
      this.setBackground([255, 255, 255]);

      if (!disabled) {
        this.enableDrawing();
      }
    }

    requiredParam(param) {
      throw new Error(`${param} is required`);
    }

    checkCanvasElement() {
      if (this.canvas.tagName !== 'CANVAS') {
        const newCanvas = document.createElement('canvas');
        this.canvas.appendChild(newCanvas);
        this.canvas = newCanvas;
      }
    }

    addListeners() {
      this.canvas.addEventListener('mousedown', this.mouseDown);
      this.canvas.addEventListener('mousemove', this.mouseMove);
      this.canvas.addEventListener('mouseleave', this.mouseLeave);
      this.canvas.addEventListener('mouseup', this.mouseUp);
      document.addEventListener('mouseup', this.mouseUpDocument);
    }

    removeListeners() {
      this.canvas.removeEventListener('mousedown', this.mouseDown);
      this.canvas.removeEventListener('mouseMove', this.mouseMove);
      this.canvas.removeEventListener('mouseLeave', this.mouseLeave);
      this.canvas.removeEventListener('mouseUp', this.mouseUp);
      document.removeEventListener('mouseUp', this.mouseUpDocument);
    }

    enableDrawing() {
      this.addListeners();
      this.toggleCursor();
    }

    disableDrawing() {
      this.removeListeners();
      this.toggleCursor();
    }

    mouseDown() {
      if (event.button !== 0) return;
      const x = event.pageX - this.canvas.offsetLeft;
      const y = event.pageY - this.canvas.offsetTop;
      if (this.selectedBucket) {
        this.fill(x, y, this.bucketToolColor, this.bucketToolTolerance);
        return;
      }
      this.isDrawing = true;
      const lenght = this.storeDrawing(x, y, false);
      this.lastPath = lenght - 1; // index last new path

      this.canvas.dispatchEvent(this.mouseDownEvent);

      this.redraw();
    }

    mouseMove() {
      if (this.leftCanvasDrawing) {
        this.leftCanvasDrawing = false;
        this.mouseDown(event);
      }
      if (this.isDrawing) {
        const x = event.pageX - this.canvas.offsetLeft;
        const y = event.pageY - this.canvas.offsetTop;
        this.storeDrawing(x, y, true);
        this.redraw();
      }
    }

    mouseUp() {
      this.isDrawing = false;
      this.canvas.dispatchEvent(this.mouseUpEvent);
    }

    mouseUpDocument() {
      this.leftCanvasDrawing = false;
    }

    mouseLeave() {
      if (this.isDrawing) this.leftCanvasDrawing = true;
      this.isDrawing = false;
      this.canvas.dispatchEvent(this.mouseLeaveEvent);
    }

    mouseEnter() {
      this.canvas.dispatchEvent(this.mouseEnterEvent);
    }

    toggleCursor() {
      if (this.canvas.style.cursor === 'crosshair') {
        this.canvas.style.cursor = 'auto';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    }

    storeDrawing(x, y, moving) {
      return this.positions.push({ x, y, moving });
    }

    redraw(all) {
      this.context.strokeStyle = this.rgbaFromArray(this.strokeColor);
      this.context.lineJoin = 'round';
      this.context.lineWidth = this.lineWidth;

      let position = [];

      if (all) {
        position = this.positions;
      } else {
        position = this.positions.slice(this.lastPath);
      }

      position.forEach(({ x, y, moving }, i) => {
        this.context.beginPath();
        if (moving && i) {
          this.context.moveTo(position[i - 1]['x'], position[i - 1]['y']);
        } else {
          this.context.moveTo(x - 1, y);
        }
        this.context.lineTo(x, y);
        this.context.closePath();
        this.context.stroke();
      });

      this.canvas.dispatchEvent(this.redrawEvent);
    }

    // https://en.wikipedia.org/wiki/Flood_fill
    fill(x, y, newColor, tolerance) {
      if (this.positions.length === 0 && !this.imageRestored) {
        this.setBackground(newColor, false);
        return;
      }
      if (typeof newColor != 'object') throw new Error('New color must be an array like: [255, 255, 255, 255]');
      const imageData = this.context.getImageData(0, 0, this.width, this.height);
      const data = imageData.data;
      const nodeColor = this.getNodeColor(x, y, data);
      const targetColor = this.getNodeColor(x, y, data);
      if (this.isNodeColorEqual(targetColor, newColor, tolerance)) return;
      if (!this.isNodeColorEqual(nodeColor, targetColor)) return;
      const queue = [];
      queue.push([x, y]);

      while (queue.length) {
        if (queue.length > this.width * this.height) break;
        const n = queue.pop();
        let w = n;
        let e = n;

        while (this.isNodeColorEqual(this.getNodeColor(w[0] - 1, w[1], data), targetColor, tolerance)) {
          w = [w[0] - 1, w[1]];
        }

        while (this.isNodeColorEqual(this.getNodeColor(e[0] + 1, e[1], data), targetColor, tolerance)) {
          e = [e[0] + 1, e[1]];
        }

        const firstNode = w[0];
        const lastNode = e[0];

        for (let i = firstNode; i <= lastNode; i++) {
          this.setNodeColor(i, w[1], newColor, data);

          if (this.isNodeColorEqual(this.getNodeColor(i, w[1] + 1, data), targetColor, tolerance)) {
            queue.push([i, w[1] + 1]);
          }

          if (this.isNodeColorEqual(this.getNodeColor(i, w[1] - 1, data), targetColor, tolerance)) {
            queue.push([i, w[1] - 1]);
          }
        }
      }

      this.context.putImageData(imageData, 0, 0);
      this.canvas.dispatchEvent(this.redrawEvent);
    }

    // i = color 1; j = color 2; t = tolerance
    isNodeColorEqual(i, j, t) {
      if (t) {
        // prettier-ignore
        return (
          Math.abs(j[0] - i[0]) <= t &&
          Math.abs(j[1] - i[1]) <= t &&
          Math.abs(j[2] - i[2]) <= t
        );
      }
      return i[0] === j[0] && i[1] === j[1] && i[2] === j[2] && i[3] === j[3];
    }

    getNodeColor(x, y, data) {
      const i = (x + y * this.width) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    }

    setNodeColor(x, y, color, data) {
      const i = (x + y * this.width) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }

    rgbaFromArray(a) {
      return `rgba(${a[0]},${a[1]},${a[2]},${a[3]})`;
    }

    rgbFromArray(a) {
      return `rgb(${a[0]},${a[1]},${a[2]})`;
    }

    setDimensions() {
      this.canvas.height = this.height;
      this.canvas.width = this.width;
    }

    validateColor(color, placeholder) {
      if (typeof color === 'object' && color.length === 4) color.pop();
      if (typeof color === 'object' && color.length === 3) {
        const validColor = [...color];
        validColor.push(255);
        return validColor;
      } else if (placeholder) {
        return [0, 0, 0, 255];
      }
      console.warn('Color was not valid!');
      return null;
    }

    // Public APIs

    on(event, callback) {
      if (this.allowedEvents.includes(event)) {
        this.canvas.addEventListener('cfd_' + event, () => callback());
      }
    }

    setLineWidth(px) {
      this.lineWidth = px;
    }

    setBackground(color, save = true) {
      const validColor = this.validateColor(color);
      if (validColor) {
        if (save) this.backgroundColor = validColor;
        this.context.fillStyle = this.rgbaFromArray(validColor);
        this.context.fillRect(0, 0, this.width, this.height);
      }
    }

    setDrawingColor(color) {
      this.setBucketTool({ color });
      this.setStrokeColor(color);
    }

    setStrokeColor(color) {
      this.strokeColor = this.validateColor(color, true);
    }

    setBucketTool(params) {
      const { color = null, tolerance = null } = params;
      if (color) this.bucketToolColor = this.validateColor(color);
      if (tolerance && tolerance > 0) this.bucketToolTolerance = tolerance;
    }

    toggleBucket() {
      return (this.selectedBucket = !this.selectedBucket);
    }

    isBucketActive() {
      return this.selectedBucket;
    }

    clear() {
      this.context.clearRect(0, 0, this.width, this.height);
      this.lastPath = null;
      this.positions = [];
      this.isDrawing = false;
      this.setBackground(this.backgroundColor);
    }

    save() {
      return this.canvas.toDataURL();
    }

    restore(backup) {
      const image = new Image();
      image.src = backup;
      image.onload = () => {
        this.imageRestored = true;
        this.context.drawImage(image, 0, 0);
      };
    }
  }

  return CanvasFreeDrawing;
});