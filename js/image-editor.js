// ===== Lightweight Image Editor =====
// Keeps the admin app dependency-free while providing the image editing
// workflow needed by the banner and character management forms.
(function registerImageEditor() {
  'use strict';

  const state = {
    sourceUrl: null,
    objectUrl: null,
    image: null,
    canvas: null,
    cropBox: null,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    crop: null,
    dragging: false,
    dragStart: null,
    onSave: null
  };

  function getStageRect() {
    return state.canvas?.getBoundingClientRect();
  }

  function transformedSize() {
    const quarterTurn = Math.abs(state.rotation % 180) === 90;
    return {
      width: quarterTurn ? state.image.naturalHeight : state.image.naturalWidth,
      height: quarterTurn ? state.image.naturalWidth : state.image.naturalHeight
    };
  }

  function buildTransformedCanvas() {
    const size = transformedSize();
    const output = document.createElement('canvas');
    output.width = size.width;
    output.height = size.height;

    const context = output.getContext('2d');
    context.translate(size.width / 2, size.height / 2);
    context.rotate((state.rotation * Math.PI) / 180);
    context.scale(state.flipHorizontal ? -1 : 1, state.flipVertical ? -1 : 1);
    context.drawImage(
      state.image,
      -state.image.naturalWidth / 2,
      -state.image.naturalHeight / 2
    );
    return output;
  }

  function renderCanvas(resetCrop = false) {
    if (!state.canvas || !state.image) return;

    const output = buildTransformedCanvas();
    const maxWidth = Math.min(760, state.canvas.parentElement.clientWidth || 760);
    const maxHeight = 420;
    const scale = Math.min(maxWidth / output.width, maxHeight / output.height, 1);
    state.canvas.width = Math.max(1, Math.round(output.width * scale));
    state.canvas.height = Math.max(1, Math.round(output.height * scale));
    state.canvas.dataset.outputWidth = String(output.width);
    state.canvas.dataset.outputHeight = String(output.height);

    const context = state.canvas.getContext('2d');
    context.clearRect(0, 0, state.canvas.width, state.canvas.height);
    context.drawImage(output, 0, 0, state.canvas.width, state.canvas.height);

    if (resetCrop || !state.crop) {
      state.crop = {
        x: 0,
        y: 0,
        width: state.canvas.width,
        height: state.canvas.height
      };
    }
    updateCropBox();
  }

  function clampCrop(crop) {
    const width = state.canvas.width;
    const height = state.canvas.height;
    const minSize = Math.min(32, width, height);
    crop.width = Math.max(minSize, Math.min(crop.width, width));
    crop.height = Math.max(minSize, Math.min(crop.height, height));
    crop.x = Math.max(0, Math.min(crop.x, width - crop.width));
    crop.y = Math.max(0, Math.min(crop.y, height - crop.height));
    return crop;
  }

  function updateCropBox() {
    if (!state.cropBox || !state.crop) return;
    clampCrop(state.crop);
    const stage = state.canvas.parentElement;
    const offsetX = Math.max(0, (stage.clientWidth - state.canvas.width) / 2);
    const offsetY = Math.max(0, (stage.clientHeight - state.canvas.height) / 2);
    state.cropBox.style.left = `${offsetX + state.crop.x}px`;
    state.cropBox.style.top = `${offsetY + state.crop.y}px`;
    state.cropBox.style.width = `${state.crop.width}px`;
    state.cropBox.style.height = `${state.crop.height}px`;
  }

  function pointFromEvent(event) {
    const rect = getStageRect();
    const stage = state.canvas.parentElement;
    const offsetX = Math.max(0, (stage.clientWidth - state.canvas.width) / 2);
    const offsetY = Math.max(0, (stage.clientHeight - state.canvas.height) / 2);
    return {
      x: Math.max(0, Math.min(state.canvas.width, event.clientX - rect.left - offsetX)),
      y: Math.max(0, Math.min(state.canvas.height, event.clientY - rect.top - offsetY))
    };
  }

  function handlePointerDown(event) {
    if (event.target !== state.canvas) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    state.dragging = true;
    state.dragStart = point;
    state.crop = { x: point.x, y: point.y, width: 1, height: 1 };
    state.canvas.setPointerCapture?.(event.pointerId);
    updateCropBox();
  }

  function handlePointerMove(event) {
    if (!state.dragging) return;
    const point = pointFromEvent(event);
    const start = state.dragStart;
    state.crop = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y)
    };
    updateCropBox();
  }

  function handlePointerUp(event) {
    if (!state.dragging) return;
    state.dragging = false;
    state.canvas.releasePointerCapture?.(event.pointerId);
    if (state.crop.width < 32 || state.crop.height < 32) {
      state.crop = {
        x: 0,
        y: 0,
        width: state.canvas.width,
        height: state.canvas.height
      };
      updateCropBox();
    }
  }

  function resetCrop() {
    state.crop = {
      x: 0,
      y: 0,
      width: state.canvas.width,
      height: state.canvas.height
    };
    updateCropBox();
  }

  function exportImage() {
    try {
      const output = buildTransformedCanvas();
      const scaleX = output.width / state.canvas.width;
      const scaleY = output.height / state.canvas.height;
      const sourceX = Math.round(state.crop.x * scaleX);
      const sourceY = Math.round(state.crop.y * scaleY);
      const sourceWidth = Math.max(1, Math.round(state.crop.width * scaleX));
      const sourceHeight = Math.max(1, Math.round(state.crop.height * scaleY));
      const result = document.createElement('canvas');
      result.width = sourceWidth;
      result.height = sourceHeight;
      result.getContext('2d').drawImage(
        output,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight
      );

      result.toBlob(blob => {
        if (!blob) {
          window.showToast?.('이미지 편집 결과를 만들지 못했습니다.', 'error');
          return;
        }
        const file = new File([blob], 'edited-image.png', { type: 'image/png' });
        state.onSave?.(file);
        close();
      }, 'image/png');
    } catch (error) {
      console.error('이미지 편집 결과 생성 실패:', error);
      window.showToast?.('이 이미지에는 편집 결과를 적용할 수 없습니다. 파일을 다시 업로드해 주세요.', 'error');
    }
  }

  function close() {
    const overlay = document.getElementById('imageEditorOverlay');
    if (overlay) overlay.remove();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    Object.assign(state, {
      sourceUrl: null,
      objectUrl: null,
      image: null,
      canvas: null,
      cropBox: null,
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
      crop: null,
      dragging: false,
      dragStart: null,
      onSave: null
    });
  }

  function open(source, onSave) {
    close();
    state.onSave = onSave;
    state.rotation = 0;
    state.flipHorizontal = false;
    state.flipVertical = false;

    const overlay = document.createElement('div');
    overlay.id = 'imageEditorOverlay';
    overlay.className = 'image-editor-overlay';
    overlay.innerHTML = `
      <section class="image-editor-modal" role="dialog" aria-modal="true" aria-labelledby="imageEditorTitle">
        <header class="image-editor-header">
          <div>
            <span class="image-editor-eyebrow">IMAGE EDITOR</span>
            <h3 id="imageEditorTitle">이미지 편집</h3>
          </div>
          <button type="button" class="modal-close" id="imageEditorClose" aria-label="이미지 편집 닫기">
            <i class="fas fa-times"></i>
          </button>
        </header>
        <div class="image-editor-body">
          <div class="image-editor-stage" id="imageEditorStage">
            <canvas id="imageEditorCanvas"></canvas>
            <div class="image-editor-crop-box" id="imageEditorCropBox">
              <span class="crop-corner top-left"></span>
              <span class="crop-corner top-right"></span>
              <span class="crop-corner bottom-left"></span>
              <span class="crop-corner bottom-right"></span>
            </div>
          </div>
          <p class="image-editor-hint"><i class="fas fa-hand-pointer"></i> 이미지 위를 드래그해 자를 영역을 선택하세요. 선택하지 않으면 전체 이미지가 저장됩니다.</p>
          <div class="image-editor-toolbar" aria-label="이미지 조작 도구">
            <button type="button" class="btn btn-secondary btn-sm" id="imageRotateLeft"><i class="fas fa-undo"></i> 왼쪽 회전</button>
            <button type="button" class="btn btn-secondary btn-sm" id="imageRotateRight"><i class="fas fa-redo"></i> 오른쪽 회전</button>
            <button type="button" class="btn btn-secondary btn-sm" id="imageFlipHorizontal"><i class="fas fa-arrows-alt-h"></i> 좌우 반전</button>
            <button type="button" class="btn btn-secondary btn-sm" id="imageFlipVertical"><i class="fas fa-arrows-alt-v"></i> 상하 반전</button>
            <button type="button" class="btn btn-secondary btn-sm" id="imageResetCrop"><i class="fas fa-expand"></i> 전체 영역</button>
          </div>
        </div>
        <footer class="image-editor-footer">
          <button type="button" class="btn btn-secondary" id="imageEditorCancel">취소</button>
          <button type="button" class="btn btn-primary" id="imageEditorSave"><i class="fas fa-check"></i> 편집 결과 사용</button>
        </footer>
      </section>
    `;
    document.body.appendChild(overlay);

    state.canvas = document.getElementById('imageEditorCanvas');
    state.cropBox = document.getElementById('imageEditorCropBox');
    document.getElementById('imageEditorClose').addEventListener('click', close);
    document.getElementById('imageEditorCancel').addEventListener('click', close);
    document.getElementById('imageEditorSave').addEventListener('click', exportImage);
    document.getElementById('imageResetCrop').addEventListener('click', resetCrop);
    document.getElementById('imageRotateLeft').addEventListener('click', () => {
      state.rotation = (state.rotation + 270) % 360;
      renderCanvas(true);
    });
    document.getElementById('imageRotateRight').addEventListener('click', () => {
      state.rotation = (state.rotation + 90) % 360;
      renderCanvas(true);
    });
    document.getElementById('imageFlipHorizontal').addEventListener('click', () => {
      state.flipHorizontal = !state.flipHorizontal;
      renderCanvas(false);
    });
    document.getElementById('imageFlipVertical').addEventListener('click', () => {
      state.flipVertical = !state.flipVertical;
      renderCanvas(false);
    });
    state.canvas.addEventListener('pointerdown', handlePointerDown);
    state.canvas.addEventListener('pointermove', handlePointerMove);
    state.canvas.addEventListener('pointerup', handlePointerUp);
    state.canvas.addEventListener('pointercancel', handlePointerUp);

    const image = new Image();
    state.image = image;
    image.onload = () => renderCanvas(true);
    image.onerror = () => {
      window.showToast?.('이미지를 불러오지 못했습니다. 파일을 다시 선택해 주세요.', 'error');
      close();
    };
    const setImageSource = url => {
      state.sourceUrl = url;
      image.src = url;
    };

    if (source instanceof Blob) {
      state.objectUrl = URL.createObjectURL(source);
      setImageSource(state.objectUrl);
    } else {
      // OPFP와 동일하게 기존 Cloudinary 이미지를 먼저 Blob으로 읽습니다.
      // 이렇게 하면 편집 결과를 canvas.toBlob()으로 만들 때 tainted canvas가
      // 되는 문제를 피할 수 있습니다.
      fetch(source)
        .then(response => {
          if (!response.ok) throw new Error('이미지 fetch 실패');
          return response.blob();
        })
        .then(blob => {
          state.objectUrl = URL.createObjectURL(blob);
          setImageSource(state.objectUrl);
        })
        .catch(() => {
          // CORS 설정이 없는 외부 URL에 대한 최후의 표시용 fallback.
          image.crossOrigin = 'anonymous';
          setImageSource(source);
        });
    }
  }

  window.FPPImageEditor = { open, close };
})();