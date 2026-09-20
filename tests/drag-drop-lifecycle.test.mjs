import test, { describe } from "node:test";
import assert from "node:assert/strict";

// 轻量级模拟 DOM 事件分发系统，测试 DOM 捕获/冒泡阶段及拖拽生命周期
class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.dataTransfer = init.dataTransfer ?? null;
    this.relatedTarget = init.relatedTarget ?? null;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.key = init.key ?? "";
    this.defaultPrevented = false;
    this._propagationStopped = false;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {
    this._propagationStopped = true;
  }
}

class MockEventTarget {
  constructor(parent = null) {
    this.parent = parent;
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = false) {
    const useCapture = typeof options === "boolean" ? options : (options?.capture ?? false);
    if (!this.listeners.has(type)) {
      this.listeners.set(type, { capture: [], bubble: [] });
    }
    const bucket = useCapture ? this.listeners.get(type).capture : this.listeners.get(type).bubble;
    bucket.push(listener);
  }

  removeEventListener(type, listener, options = false) {
    const useCapture = typeof options === "boolean" ? options : (options?.capture ?? false);
    if (!this.listeners.has(type)) return;
    const bucket = useCapture ? this.listeners.get(type).capture : this.listeners.get(type).bubble;
    const index = bucket.indexOf(listener);
    if (index !== -1) bucket.splice(index, 1);
  }

  getPath() {
    const path = [];
    let currentTarget = this.parent;
    path.unshift(this);
    while (currentTarget) {
      path.unshift(currentTarget);
      currentTarget = currentTarget.parent;
    }
    return path;
  }

  dispatchEvent(event) {
    const path = this.getPath();

    // 1. 捕获阶段 (Capture Phase: root -> target)
    for (const node of path) {
      if (event._propagationStopped) break;
      const bucket = node.listeners.get(event.type)?.capture ?? [];
      for (const listener of [...bucket]) {
        listener(event);
      }
    }

    // 2. 目标及冒泡阶段 (Bubble Phase: target -> root)
    if (event.bubbles) {
      const bubblePath = [...path].reverse();
      for (const node of bubblePath) {
        if (event._propagationStopped) break;
        const bucket = node.listeners.get(event.type)?.bubble ?? [];
        for (const listener of [...bucket]) {
          listener(event);
        }
      }
    }

    return !event.defaultPrevented;
  }
}

// 模拟 DesignUploadEnhancer 拖拽核心逻辑控制器
function createUploadEnhancerController(windowMock, documentMock) {
  let isDragging = false;
  let dragDepth = 0;
  let notice = null;
  let appliedFiles = null;

  const isFileDragEvent = (event) => {
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) return true;
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  };

  const pickPrimaryFileInput = () => {
    return documentMock.querySelector("input[type='file']:not(:disabled)");
  };

  const applyFilesToInput = (input, files) => {
    appliedFiles = files;
    input.dispatchEvent(new MockEvent("change", { bubbles: true }));
    return true;
  };

  const resetDrag = () => {
    dragDepth = 0;
    isDragging = false;
  };

  const onDragEnterCapture = (event) => {
    if (!isFileDragEvent(event)) return;
    dragDepth += 1;
    isDragging = true;
  };

  const onDragOver = (event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    isDragging = true;
  };

  const onDragLeaveCapture = (event) => {
    if (!isFileDragEvent(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (
      dragDepth === 0 ||
      !event.relatedTarget ||
      (event.clientX <= 0 && event.clientY <= 0)
    ) {
      resetDrag();
    }
  };

  const onDropCapture = (event) => {
    if (!isFileDragEvent(event)) return;
    resetDrag();
  };

  const onDropBubble = (event) => {
    if (!isFileDragEvent(event)) return;
    resetDrag();

    if (event.defaultPrevented) return;
    event.preventDefault();

    const input = pickPrimaryFileInput();
    const files = event.dataTransfer?.files;
    if (!input || !files || files.length === 0) {
      notice = "当前页面未找到可用上传入口";
      return;
    }

    applyFilesToInput(input, files);
  };

  const onDragEnd = () => resetDrag();
  const onWindowBlur = () => resetDrag();
  const onKeyDown = (event) => {
    if (event.key === "Escape") resetDrag();
  };

  windowMock.addEventListener("dragenter", onDragEnterCapture, true);
  windowMock.addEventListener("dragover", onDragOver, false);
  windowMock.addEventListener("dragleave", onDragLeaveCapture, true);
  windowMock.addEventListener("drop", onDropCapture, true);
  windowMock.addEventListener("drop", onDropBubble, false);
  windowMock.addEventListener("dragend", onDragEnd);
  windowMock.addEventListener("blur", onWindowBlur);
  windowMock.addEventListener("keydown", onKeyDown);

  return {
    get isDragging() { return isDragging; },
    get dragDepth() { return dragDepth; },
    get notice() { return notice; },
    get appliedFiles() { return appliedFiles; },
  };
}

describe("拖拽增强与遮罩生命周期状态测试", () => {
  let windowMock;
  let documentMock;
  let dropzoneMock;
  let fileInputMock;
  let enhancer;

  const mockFile = { name: "test.png", type: "image/png" };
  const createDataTransfer = () => ({
    types: ["Files"],
    files: [mockFile],
    dropEffect: "none",
  });

  test("1. 拖入文件时激活遮罩状态 (isDragging = true)", () => {
    windowMock = new MockEventTarget();
    documentMock = new MockEventTarget(windowMock);
    enhancer = createUploadEnhancerController(windowMock, documentMock);

    const dragEnterEvent = new MockEvent("dragenter", {
      dataTransfer: createDataTransfer(),
    });
    windowMock.dispatchEvent(dragEnterEvent);

    assert.equal(enhancer.isDragging, true, "拖入文件后 isDragging 必须为 true");
    assert.equal(enhancer.dragDepth, 1, "dragDepth 深度应递增为 1");
  });

  test("2. 子元素已调用 preventDefault() 时，drop 后遮罩必须关闭，且不重复触发全局兜底上传", () => {
    windowMock = new MockEventTarget();
    documentMock = new MockEventTarget(windowMock);
    dropzoneMock = new MockEventTarget(documentMock);
    fileInputMock = new MockEventTarget(documentMock);
    documentMock.querySelector = () => fileInputMock;

    enhancer = createUploadEnhancerController(windowMock, documentMock);

    // 模拟子组件自身的 dropzone 逻辑
    let localHandled = false;
    dropzoneMock.addEventListener("drop", (e) => {
      e.preventDefault(); // 局部区域已消费
      localHandled = true;
    });

    // 模拟拖入
    dropzoneMock.dispatchEvent(new MockEvent("dragenter", {
      dataTransfer: createDataTransfer(),
    }));
    assert.equal(enhancer.isDragging, true);

    // 模拟在局部 dropzone 上松手
    dropzoneMock.dispatchEvent(new MockEvent("drop", {
      dataTransfer: createDataTransfer(),
    }));

    assert.equal(localHandled, true, "局部 dropzone 应当成功执行");
    assert.equal(enhancer.isDragging, false, "drop 发生后，遮罩必须立即消失 (isDragging === false)");
    assert.equal(enhancer.appliedFiles, null, "局部已处理，不应重复触发全局兜底上传");
  });

  test("3. 子元素调用 stopPropagation() 阻断冒泡时，捕获阶段仍能安全关闭遮罩", () => {
    windowMock = new MockEventTarget();
    documentMock = new MockEventTarget(windowMock);
    dropzoneMock = new MockEventTarget(documentMock);
    enhancer = createUploadEnhancerController(windowMock, documentMock);

    // 模拟如 DocxPreviewToPdf 等阻断冒泡的组件
    dropzoneMock.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation(); // 阻断冒泡！
    });

    // 拖入
    dropzoneMock.dispatchEvent(new MockEvent("dragenter", {
      dataTransfer: createDataTransfer(),
    }));
    assert.equal(enhancer.isDragging, true);

    // 在阻断冒泡的组件上 drop
    dropzoneMock.dispatchEvent(new MockEvent("drop", {
      dataTransfer: createDataTransfer(),
    }));

    assert.equal(enhancer.isDragging, false, "即使子元素 stopPropagation，捕获阶段也必须将遮罩关闭");
  });

  test("4. 拖放到页面空白处时，遮罩关闭，且全局增强兜底上传至主输入框", () => {
    windowMock = new MockEventTarget();
    documentMock = new MockEventTarget(windowMock);
    const blankArea = new MockEventTarget(documentMock);
    fileInputMock = new MockEventTarget(documentMock);
    documentMock.querySelector = (selector) => {
      if (selector.includes("input[type='file']")) return fileInputMock;
      return null;
    };

    let inputChanged = false;
    fileInputMock.addEventListener("change", () => {
      inputChanged = true;
    });

    enhancer = createUploadEnhancerController(windowMock, documentMock);

    // 拖入空白处
    blankArea.dispatchEvent(new MockEvent("dragenter", {
      dataTransfer: createDataTransfer(),
    }));
    assert.equal(enhancer.isDragging, true);

    // 在空白处松手
    blankArea.dispatchEvent(new MockEvent("drop", {
      dataTransfer: createDataTransfer(),
    }));

    assert.equal(enhancer.isDragging, false, "空白处松手遮罩必须关闭");
    assert.equal(inputChanged, true, "空白处松手应触发主输入框的 change 事件完成全局兜底");
    assert.deepEqual(enhancer.appliedFiles, [mockFile], "主输入框接收到的文件列表正确");
  });

  test("5. 按 Escape 键取消拖拽时，遮罩必须立即退出", () => {
    windowMock = new MockEventTarget();
    documentMock = new MockEventTarget(windowMock);
    enhancer = createUploadEnhancerController(windowMock, documentMock);

    // 拖入
    windowMock.dispatchEvent(new MockEvent("dragenter", {
      dataTransfer: createDataTransfer(),
    }));
    assert.equal(enhancer.isDragging, true);

    // 按 Escape 键
    windowMock.dispatchEvent(new MockEvent("keydown", { key: "Escape" }));
    assert.equal(enhancer.isDragging, false, "按 Escape 键后遮罩必须立即关闭");
    assert.equal(enhancer.dragDepth, 0, "dragDepth 深度应重置为 0");
  });

  test("6. 离开窗口边界 (relatedTarget === null) 时，遮罩必须立即退出", () => {
    windowMock = new MockEventTarget();
    documentMock = new MockEventTarget(windowMock);
    enhancer = createUploadEnhancerController(windowMock, documentMock);

    // 拖入
    windowMock.dispatchEvent(new MockEvent("dragenter", {
      dataTransfer: createDataTransfer(),
    }));
    assert.equal(enhancer.isDragging, true);

    // 移出浏览器窗口
    windowMock.dispatchEvent(new MockEvent("dragleave", {
      dataTransfer: createDataTransfer(),
      relatedTarget: null,
    }));
    assert.equal(enhancer.isDragging, false, "移出窗口后遮罩必须关闭");
  });
});
