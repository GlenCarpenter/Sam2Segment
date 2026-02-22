(() => {
    function initSam2Points() {
        if (!window.imageEditor || typeof ImageEditor === 'undefined' || typeof ImageEditorTool === 'undefined') {
            return false;
        }

        class ImageEditorToolSam2Points extends ImageEditorTool {
            constructor(editor) {
                super(editor, 'sam2points', 'crosshair', 'SAM2 Points', 'Left click to add positive points. Right click to add negative points.\nEach click regenerates the mask.\nHotKey: Y', 'y');
                this.cursor = 'crosshair';
                this.positivePoints = [];
                this.negativePoints = [];
                this.requestSerial = 0;
                this.activeRequestId = 0;
                this.maskRequestInFlight = false;
                this.pendingMaskUpdate = false;
                this.configDiv.innerHTML = `
                <div class="image-editor-tool-block tool-block-nogrow">
                    <button class="basic-button id-clear-points">Clear Points</button>
                    <button class="basic-button id-clear-mask">Clear Mask</button>
                </div>`;
                this.configDiv.querySelector('.id-clear-points').addEventListener('click', () => {
                    this.positivePoints = [];
                    this.negativePoints = [];
                    this.activeRequestId = ++this.requestSerial;
                    this.maskRequestInFlight = false;
                    this.pendingMaskUpdate = false;
                    this.editor.redraw();
                });
                this.configDiv.querySelector('.id-clear-mask').addEventListener('click', () => {
                    let maskLayer = this.editor.activeLayer && this.editor.activeLayer.isMask ? this.editor.activeLayer : this.editor.layers.find(layer => layer.isMask);
                    if (!maskLayer) {
                        return;
                    }
                    maskLayer.saveBeforeEdit();
                    maskLayer.ctx.clearRect(0, 0, maskLayer.canvas.width, maskLayer.canvas.height);
                    maskLayer.hasAnyContent = false;
                    this.activeRequestId = ++this.requestSerial;
                    this.maskRequestInFlight = false;
                    this.pendingMaskUpdate = false;
                    this.editor.redraw();
                });
            }

            drawPoint(ctx, x, y, fillColor, showX) {
                let [cx, cy] = this.editor.imageCoordToCanvasCoord(x, y);
                let radius = Math.max(3, Math.round(4 * this.editor.zoomLevel));
                ctx.save();
                ctx.lineWidth = Math.max(1, Math.round(2 * this.editor.zoomLevel));
                ctx.strokeStyle = '#000000';
                ctx.fillStyle = fillColor;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
                if (showX) {
                    let cross = Math.max(3, Math.round(radius * 0.9));
                    ctx.beginPath();
                    ctx.moveTo(cx - cross, cy - cross);
                    ctx.lineTo(cx + cross, cy + cross);
                    ctx.moveTo(cx - cross, cy + cross);
                    ctx.lineTo(cx + cross, cy - cross);
                    ctx.stroke();
                }
                ctx.restore();
            }

            draw() {
                let ctx = this.editor.ctx;
                for (let point of this.positivePoints) {
                    this.drawPoint(ctx, point.x, point.y, '#33ff99', false);
                }
                for (let point of this.negativePoints) {
                    this.drawPoint(ctx, point.x, point.y, '#ff3355', true);
                }
            }

            onContextMenu(e) {
                e.preventDefault();
                return true;
            }

            onMouseDown(e) {
                if (e.button !== 0 && e.button !== 2) {
                    return;
                }
                this.editor.updateMousePosFrom(e);
                let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
                mouseX = Math.round(mouseX);
                mouseY = Math.round(mouseY);
                if (mouseX < 0 || mouseY < 0 || mouseX >= this.editor.realWidth || mouseY >= this.editor.realHeight) {
                    return;
                }
                let point = { x: mouseX, y: mouseY };
                if (e.button === 2) {
                    e.preventDefault();
                    this.negativePoints.push(point);
                }
                else {
                    this.positivePoints.push(point);
                }
                this.queueMaskUpdate();
                this.editor.redraw();
            }

            queueMaskUpdate() {
                if (!currentBackendFeatureSet.includes('sam2')) {
                    $('#sam2_installer').modal('show');
                    return;
                }
                if (this.positivePoints.length === 0) {
                    return;
                }
                if (this.maskRequestInFlight) {
                    this.pendingMaskUpdate = true;
                    return;
                }
                this.requestMaskUpdate();
            }

            finishMaskUpdate(requestId) {
                if (requestId !== this.activeRequestId) {
                    return;
                }
                this.maskRequestInFlight = false;
                if (this.pendingMaskUpdate) {
                    this.pendingMaskUpdate = false;
                    this.requestMaskUpdate();
                }
            }

            requestMaskUpdate() {
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
                genData['sampositivepoints'] = JSON.stringify(this.positivePoints);
                if (this.negativePoints.length > 0) {
                    genData['samnegativepoints'] = JSON.stringify(this.negativePoints);
                }
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
                        this.finishMaskUpdate(requestId);
                    };
                    newImg.src = data.image;
                });
            }
        }

        function applyMaskFromImage(editor, img, replaceExisting = true) {
            let maskLayer = editor.activeLayer && editor.activeLayer.isMask ? editor.activeLayer : editor.layers.find(layer => layer.isMask);
            if (!maskLayer) {
                maskLayer = new ImageEditorLayer(editor, img.naturalWidth || img.width, img.naturalHeight || img.height);
                maskLayer.isMask = true;
                editor.addLayer(maskLayer);
            }
            if (replaceExisting) {
                maskLayer.saveBeforeEdit();
                maskLayer.ctx.clearRect(0, 0, maskLayer.canvas.width, maskLayer.canvas.height);
            }
            maskLayer.ctx.drawImage(img, 0, 0, maskLayer.canvas.width, maskLayer.canvas.height);
            maskLayer.hasAnyContent = true;
            editor.setActiveLayer(maskLayer);
            editor.sortLayers();
            editor.redraw();
        }

        const editorProto = ImageEditor.prototype;
        if (!editorProto.__sam2ApplyMaskPatched) {
            editorProto.__sam2ApplyMaskPatched = true;
            editorProto.applyMaskFromImage = function applyMaskFromImageWrapper(img, replaceExisting = true) {
                applyMaskFromImage(this, img, replaceExisting);
            };
        }
        if (!editorProto.__sam2ContextMenuPatched) {
            editorProto.__sam2ContextMenuPatched = true;
            const originalCreateCanvas = editorProto.createCanvas;
            editorProto.createCanvas = function createCanvasPatched() {
                originalCreateCanvas.call(this);
                this.canvas.addEventListener('contextmenu', e => {
                    if (this.activeTool && this.activeTool.onContextMenu) {
                        if (this.activeTool.onContextMenu(e)) {
                            e.preventDefault();
                        }
                    }
                });
            };
        }
        if (!editorProto.__sam2PointsToolPatched) {
            editorProto.__sam2PointsToolPatched = true;
            const originalActivate = editorProto.activate;
            editorProto.activate = function activateSam2PointsPatched() {
                if (this.tools && !this.tools['sam2points']) {
                    this.addTool(new ImageEditorToolSam2Points(this));
                    this.toolHotkeys['y'] = 'sam2points';
                    if (this.tools['sam2points']?.div) {
                        this.tools['sam2points'].div.style.backgroundImage = 'url(ExtensionFile/Sam2Segment/Assets/crosshair.png)';
                    }
                }
                return originalActivate.call(this);
            };
        }
        if (!editorProto.__sam2PointsClearOnNewImage) {
            editorProto.__sam2PointsClearOnNewImage = true;
            const originalSetBaseImage = editorProto.setBaseImage;
            editorProto.setBaseImage = function setBaseImageClearPoints(img, width, height) {
                if (this.tools && this.tools['sam2points']) {
                    this.tools['sam2points'].positivePoints = [];
                    this.tools['sam2points'].negativePoints = [];
                }
                return originalSetBaseImage.call(this, img, width, height);
            };
        }

        function ensureContextMenuHandler(editor) {
            if (!editor || !editor.canvas || editor.__sam2PointsContextMenuAttached) {
                return;
            }
            editor.__sam2PointsContextMenuAttached = true;
            editor.canvas.addEventListener('contextmenu', e => {
                if (editor.activeTool && editor.activeTool.onContextMenu) {
                    if (editor.activeTool.onContextMenu(e)) {
                        e.preventDefault();
                    }
                }
            });
        }

        function addToolIfReady() {
            if (!window.imageEditor) {
                return false;
            }
            ensureContextMenuHandler(window.imageEditor);
            if (window.imageEditor.tools && !window.imageEditor.tools['sam2points']) {
                window.imageEditor.addTool(new ImageEditorToolSam2Points(window.imageEditor));
                window.imageEditor.toolHotkeys['y'] = 'sam2points';
                if (window.imageEditor.tools['sam2points']?.div) {
                    window.imageEditor.tools['sam2points'].div.style.backgroundImage = 'url(ExtensionFile/Sam2Segment/Assets/crosshair.png)';
                }
                return true;
            }
            return false;
        }

        return addToolIfReady();
    }

    if (!initSam2Points()) {
        const interval = setInterval(() => {
            if (initSam2Points()) {
                clearInterval(interval);
            }
        }, 250);
    }
})();
