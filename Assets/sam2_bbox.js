(() => {
    function initSam2BBox() {
        if (!window.imageEditor || typeof ImageEditor === 'undefined' || typeof ImageEditorTool === 'undefined') {
            return false;
        }

        class ImageEditorToolSam2BBox extends ImageEditorTool {
            constructor(editor) {
                super(editor, 'sam2bbox', 'rectangle', 'SAM2 BBox', 'Click and drag to create a bounding box. Release to generate mask.\nHotKey: B', 'b');
                this.cursor = 'crosshair';
                this.bboxStartX = null;
                this.bboxStartY = null;
                this.bboxEndX = null;
                this.bboxEndY = null;
                this.isDrawing = false;
                this.requestSerial = 0;
                this.activeRequestId = 0;
                this.maskRequestInFlight = false;
                this.modelWarmed = false;
                this.isWarmingUp = false;
                this.configDiv.innerHTML = `
                <div class="image-editor-tool-block tool-block-nogrow">
                    <button class="basic-button id-clear-mask">Clear Mask</button>
                    <span class="id-sam2-status" style="display:none; margin-left:8px; opacity:0.8; font-style:italic;">Warming up SAM2 model...</span>
                </div>`;
                this.configDiv.querySelector('.id-clear-mask').addEventListener('click', () => {
                    let maskLayer = this.editor.activeLayer && this.editor.activeLayer.isMask ? this.editor.activeLayer : this.editor.layers.find(layer => layer.isMask);
                    if (!maskLayer) {
                        return;
                    }
                    maskLayer.saveBeforeEdit();
                    maskLayer.ctx.clearRect(0, 0, maskLayer.canvas.width, maskLayer.canvas.height);
                    maskLayer.hasAnyContent = false;
                    this.editor.redraw();
                });
            }

            draw() {
                if (this.isDrawing && this.bboxStartX !== null && this.bboxEndX !== null) {
                    let ctx = this.editor.ctx;
                    let [x1, y1] = this.editor.imageCoordToCanvasCoord(this.bboxStartX, this.bboxStartY);
                    let [x2, y2] = this.editor.imageCoordToCanvasCoord(this.bboxEndX, this.bboxEndY);
                    let minX = Math.min(x1, x2);
                    let minY = Math.min(y1, y2);
                    let maxX = Math.max(x1, x2);
                    let maxY = Math.max(y1, y2);
                    let width = maxX - minX;
                    let height = maxY - minY;

                    ctx.save();
                    ctx.strokeStyle = '#33ff99';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.strokeRect(minX, minY, width, height);
                    ctx.restore();
                }
            }

            setActive() {
                super.setActive();
                if (!this.modelWarmed && !this.isWarmingUp
                        && currentBackendFeatureSet.includes('sam2')
                        && this.editor.getFinalImageData?.()) {
                    this.triggerWarmup();
                }
            }

            triggerWarmup() {
                this.isWarmingUp = true;
                let statusElem = this.configDiv.querySelector('.id-sam2-status');
                if (statusElem) { statusElem.style.display = ''; }
                try {
                    let img = this.editor.getFinalImageData();
                    let genData = getGenInput();
                    genData['sampointimage'] = img;
                    genData['images'] = 1;
                    genData['prompt'] = '';
                    delete genData['batchsize'];
                    genData['donotsave'] = true;
                    let cx = Math.floor((this.editor.realWidth || 64) / 2);
                    let cy = Math.floor((this.editor.realHeight || 64) / 2);
                    genData['sambbox'] = JSON.stringify([cx - 1, cy - 1, cx + 1, cy + 1]);
                    makeWSRequestT2I('GenerateText2ImageWS', genData, data => {
                        if (data.image || data.error) {
                            this.modelWarmed = true;
                            this.isWarmingUp = false;
                            if (statusElem) { statusElem.style.display = 'none'; }
                        }
                    });
                } catch (e) {
                    this.modelWarmed = true;
                    this.isWarmingUp = false;
                    if (statusElem) { statusElem.style.display = 'none'; }
                }
            }

            onMouseDown(e) {
                if (this.isWarmingUp) { return; }
                if (e.button !== 0) {
                    return;
                }
                this.editor.updateMousePosFrom(e);
                let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
                mouseX = Math.round(mouseX);
                mouseY = Math.round(mouseY);
                if (mouseX < 0 || mouseY < 0 || mouseX >= this.editor.realWidth || mouseY >= this.editor.realHeight) {
                    return;
                }
                this.isDrawing = true;
                this.bboxStartX = mouseX;
                this.bboxStartY = mouseY;
                this.bboxEndX = mouseX;
                this.bboxEndY = mouseY;
            }

            onMouseMove(e) {
                if (this.isDrawing) {
                    this.editor.updateMousePosFrom(e);
                    let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
                    mouseX = Math.round(mouseX);
                    mouseY = Math.round(mouseY);
                    mouseX = Math.max(0, Math.min(this.editor.realWidth - 1, mouseX));
                    mouseY = Math.max(0, Math.min(this.editor.realHeight - 1, mouseY));
                    this.bboxEndX = mouseX;
                    this.bboxEndY = mouseY;
                    this.editor.redraw();
                }
            }

            onMouseUp(e) {
                if (this.isWarmingUp) { return; }
                if (this.isDrawing) {
                    this.isDrawing = false;
                    this.requestMaskUpdate();
                }
            }

            requestMaskUpdate() {
                if (!currentBackendFeatureSet.includes('sam2')) {
                    $('#sam2_installer').modal('show');
                    return;
                }
                if (this.bboxStartX === null || this.bboxEndX === null) {
                    return;
                }

                this.maskRequestInFlight = true;
                let requestId = ++this.requestSerial;
                this.activeRequestId = requestId;

                let img = this.editor.getFinalImageData();
                let genData = getGenInput();
                genData['sampointimage'] = img;
                genData['images'] = 1;
                genData['prompt'] = '';
                delete genData['batchsize'];
                genData['donotsave'] = true;

                let minX = Math.min(this.bboxStartX, this.bboxEndX);
                let minY = Math.min(this.bboxStartY, this.bboxEndY);
                let maxX = Math.max(this.bboxStartX, this.bboxEndX);
                let maxY = Math.max(this.bboxStartY, this.bboxEndY);
                genData['sambbox'] = JSON.stringify([minX, minY, maxX, maxY]);

                makeWSRequestT2I('GenerateText2ImageWS', genData, data => {
                    if (requestId !== this.activeRequestId) {
                        return;
                    }
                    if (!data.image) {
                        return;
                    }
                    let newImg = new Image();
                    newImg.onload = () => {
                        if (requestId !== this.activeRequestId) {
                            return;
                        }
                        this.editor.applyMaskFromImage(newImg, true);
                        this.maskRequestInFlight = false;
                    };
                    newImg.src = data.image;
                });
            }
        }

        const editorProto = ImageEditor.prototype;
        if (!editorProto.__sam2BBoxToolPatched) {
            editorProto.__sam2BBoxToolPatched = true;
            const originalActivate = editorProto.activate;
            editorProto.activate = function activateSam2BBoxPatched() {
                if (this.tools && !this.tools['sam2bbox']) {
                    this.addTool(new ImageEditorToolSam2BBox(this));
                    this.toolHotkeys['b'] = 'sam2bbox';
                    if (this.tools['sam2bbox']?.div) {
                        this.tools['sam2bbox'].div.style.backgroundImage = 'url(ExtensionFile/Sam2Segment/Assets/rectangle.png)';
                    }
                }
                return originalActivate.call(this);
            };
        }
        if (!editorProto.__sam2BBoxClearOnNewImage) {
            editorProto.__sam2BBoxClearOnNewImage = true;
            const originalSetBaseImage = editorProto.setBaseImage;
            editorProto.setBaseImage = function setBaseImageClearBBox(img, width, height) {
                if (this.tools && this.tools['sam2bbox']) {
                    this.tools['sam2bbox'].bboxStartX = null;
                    this.tools['sam2bbox'].bboxStartY = null;
                    this.tools['sam2bbox'].bboxEndX = null;
                    this.tools['sam2bbox'].bboxEndY = null;
                }
                return originalSetBaseImage.call(this, img, width, height);
            };
        }

        function addToolIfReady() {
            if (!window.imageEditor) {
                return false;
            }
            if (window.imageEditor.tools && !window.imageEditor.tools['sam2bbox']) {
                window.imageEditor.addTool(new ImageEditorToolSam2BBox(window.imageEditor));
                window.imageEditor.toolHotkeys['b'] = 'sam2bbox';
                if (window.imageEditor.tools['sam2bbox']?.div) {
                    window.imageEditor.tools['sam2bbox'].div.style.backgroundImage = 'url(ExtensionFile/Sam2Segment/Assets/rectangle.png)';
                }
                return true;
            }
            return false;
        }

        return addToolIfReady();
    }

    if (!initSam2BBox()) {
        const interval = setInterval(() => {
            if (initSam2BBox()) {
                clearInterval(interval);
            }
        }, 250);
    }
})();
