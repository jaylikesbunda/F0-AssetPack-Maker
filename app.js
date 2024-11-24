document.addEventListener('DOMContentLoaded', () => {
    const app = {
        imageProcessor: new ImageProcessor(),
        
        init() {
            this.bindEvents();
            this.setupTabs();
            this.validatePackName();
        },

        bindEvents() {
            document.getElementById('uploadAnimsBtn').addEventListener('click', () => this.handleFileUpload('animation'));
            document.getElementById('uploadIconsBtn').addEventListener('click', () => this.handleFileUpload('icon'));
            document.getElementById('exportPackBtn').addEventListener('click', () => this.exportPack());
            
            // Pack name validation
            document.getElementById('packName').addEventListener('input', (e) => this.validatePackName(e.target.value));
            
            // Tab switching
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
            });

            // Checkbox event listeners
            document.getElementById('includeAnims').addEventListener('change', this.updateUI.bind(this));
            document.getElementById('includeIcons').addEventListener('change', this.updateUI.bind(this));

            // Event listener for 'Show Monochrome' toggle
            document.getElementById('iconList').addEventListener('change', async (e) => {
                if (e.target.classList.contains('preview-mono')) {
                    const iconItem = e.target.closest('.icon-item');
                    const name = iconItem.dataset.name;
                    const showMonochrome = e.target.checked;
                    const icon = this.imageProcessor.icons.get(name);
                    
                    try {
                        if (showMonochrome) {
                            const img = iconItem.querySelector('img');
                            const monochromeUrl = await Utils.previewMonochrome(img);
                            img.src = monochromeUrl;
                        } else {
                            // Restore original image
                            iconItem.querySelector('img').src = icon.image.dataUrl;
                        }
                    } catch (error) {
                        this.updateStatus('Error applying monochrome: ' + error.message, true);
                        e.target.checked = false;
                    }
                }
            });
        },

        setupTabs() {
            this.switchTab('animations');
        },

        validatePackName(value = '') {
            const packNameInput = document.getElementById('packName');
            const exportBtn = document.getElementById('exportPackBtn');
            
            // Remove special characters and spaces
            const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '');
            if (sanitized !== value) {
                packNameInput.value = sanitized;
            }
            
            // Enable/disable export button based on pack name
            exportBtn.disabled = !sanitized;
            return sanitized.length > 0 && sanitized.length <= 32;
        },

        updateUI() {
            const includeAnims = document.getElementById('includeAnims').checked;
            const includeIcons = document.getElementById('includeIcons').checked;
            
            document.getElementById('uploadAnimsBtn').disabled = !includeAnims;
            document.getElementById('uploadIconsBtn').disabled = !includeIcons;
            
            // Update tab visibility
            const animTab = document.querySelector('[data-tab="animations"]');
            const iconTab = document.querySelector('[data-tab="icons"]');
            
            animTab.style.display = includeAnims ? 'block' : 'none';
            iconTab.style.display = includeIcons ? 'block' : 'none';
            
            // Switch to visible tab if current is hidden
            if (!includeAnims && !includeIcons) {
                document.getElementById('exportPackBtn').disabled = true;
            } else {
                document.getElementById('exportPackBtn').disabled = false;
                if (!includeAnims && this.getCurrentTab() === 'animations') {
                    this.switchTab('icons');
                } else if (!includeIcons && this.getCurrentTab() === 'icons') {
                    this.switchTab('animations');
                }
            }
        },

        getCurrentTab() {
            const activeTab = document.querySelector('.tab-btn.active');
            return activeTab ? activeTab.dataset.tab : null;
        },

        switchTab(tabName) {
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.toggle('hidden', content.id !== `${tabName}Tab`);
            });
        },

        async handleFileUpload(type) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png';
            if (type === 'animation') {
                input.multiple = true;
            }
            
            input.onchange = async (e) => {
                const files = Array.from(e.target.files);
                if (type === 'animation') {
                    await this.addAnimation(files);
                } else {
                    await this.addIcon(files[0]);
                }
            };
            
            input.click();
        },

        async addAnimation(files) {
            const loadingContainer = document.createElement('div');
            loadingContainer.classList.add('animation-item', 'loading');
            document.getElementById('animationList').appendChild(loadingContainer);

            try {
                const processedFiles = [];
                for (const file of files) {
                    const img = await createImageBitmap(file);
                    if (img.width !== 128 || img.height !== 64) {
                        const shouldResize = await this.showResizePrompt(file, img.width, img.height);
                        if (!shouldResize) {
                            throw new Error('Cancelled by user');
                        }
                        const resized = await this.resizeImage(file);
                        processedFiles.push(resized);
                    } else {
                        processedFiles.push(file);
                    }
                }

                const name = `animation_${Date.now()}`;
                const previewUrl = await this.imageProcessor.addAnimation(processedFiles, name);
                const container = await this.addAnimationToUI(name, previewUrl, processedFiles.length);
                document.getElementById('animationList').appendChild(container);
                this.updateStatus('Added animation successfully');
            } catch (error) {
                this.updateStatus('Error adding animation: ' + error.message, true);
            } finally {
                loadingContainer.remove();
            }
        },

        async showResizePrompt(file, currentWidth, currentHeight) {
            return new Promise((resolve) => {
                const template = document.getElementById('resizeModalTemplate');
                const modal = template.content.cloneNode(true).querySelector('.modal-overlay');
                
                // Set up preview images
                const originalImg = modal.querySelector('.original-img');
                const previewImg = modal.querySelector('.preview-img');
                
                // Update original image
                originalImg.src = URL.createObjectURL(file);
                
                // Create resized preview
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                
                // Configure for pixel art
                ctx.imageSmoothingEnabled = false;
                ctx.mozImageSmoothingEnabled = false;
                ctx.webkitImageSmoothingEnabled = false;
                ctx.msImageSmoothingEnabled = false;
                
                // Load image and create preview
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(128 / currentWidth, 64 / currentHeight);
                    const newWidth = Math.floor(currentWidth * scale);
                    const newHeight = Math.floor(currentHeight * scale);
                    
                    const x = Math.floor((128 - newWidth) / 2);
                    const y = Math.floor((64 - newHeight) / 2);
                    
                    ctx.clearRect(0, 0, 128, 64);
                    ctx.drawImage(img, 0, 0, currentWidth, currentHeight, x, y, newWidth, newHeight);
                    previewImg.src = canvas.toDataURL('image/png');
                };
                img.src = URL.createObjectURL(file);

                // Update size text
                modal.querySelector('.original h4').textContent = `Original (${currentWidth}x${currentHeight})`;
                
                // Add button handlers
                modal.querySelector('.resize-confirm').addEventListener('click', () => {
                    document.body.removeChild(modal);
                    URL.revokeObjectURL(originalImg.src);
                    URL.revokeObjectURL(img.src);
                    resolve(true);
                });
                
                modal.querySelector('.cancel').addEventListener('click', () => {
                    document.body.removeChild(modal);
                    URL.revokeObjectURL(originalImg.src);
                    URL.revokeObjectURL(img.src);
                    resolve(false);
                });
                
                document.body.appendChild(modal);
            });
        },

        async resizeImage(file) {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            
            // Configure for pixel art
            ctx.imageSmoothingEnabled = false;
            ctx.mozImageSmoothingEnabled = false;
            ctx.webkitImageSmoothingEnabled = false;
            ctx.msImageSmoothingEnabled = false;
            
            const img = await createImageBitmap(file);
            
            // Calculate aspect ratio preserving dimensions
            const scale = Math.min(128 / img.width, 64 / img.height);
            const newWidth = Math.floor(img.width * scale);
            const newHeight = Math.floor(img.height * scale);
            
            // Center the image
            const x = Math.floor((128 - newWidth) / 2);
            const y = Math.floor((64 - newHeight) / 2);
            
            // Clear with transparency
            ctx.clearRect(0, 0, 128, 64);
            
            // Draw with pixel-perfect scaling
            ctx.drawImage(img, 0, 0, img.width, img.height, x, y, newWidth, newHeight);
            
            return new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png');
            });
        },

        async addIcon(file) {
            if (!file) return;

            try {
                // Load the image first to get dimensions
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = URL.createObjectURL(file);
                });
                
                const name = this.generateUniqueName(file.name);
                const previewUrl = await this.imageProcessor.addIcon(name, file, img.width, img.height);
                
                // Clean up the blob URL
                URL.revokeObjectURL(img.src);
                
                await this.addIconToUI(name, previewUrl);
                this.updateStatus('Added icon successfully');
            } catch (error) {
                this.updateStatus('Error adding icon: ' + error.message, true);
            }
        },

        generateUniqueName(originalName) {
            const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
            return `${baseName}_${Date.now()}`;
        },

        addAnimationToUI(name, previewUrl, frameCount) {
            const template = document.getElementById('animationItemTemplate');
            const clone = template.content.cloneNode(true);
            const container = clone.querySelector('.animation-item');
            container.dataset.name = name;

            // Set up preview image
            const preview = container.querySelector('img');
            preview.src = previewUrl;

            // Frame navigation controls setup
            const prevBtn = container.querySelector('.prev-frame');
            const nextBtn = container.querySelector('.next-frame');
            const playBtn = container.querySelector('.play-pause');
            const frameCounter = container.querySelector('.frame-counter');
            const frameList = container.querySelector('.frame-list');
            const monoToggle = container.querySelector('.preview-mono');
            
            let isPlaying = false;
            let currentFrame = 0;
            let animationInterval;

            const updateFrameDisplay = async () => {
                const animation = this.imageProcessor.animations.get(name);
                if (!animation) return;
                
                const showMonochrome = monoToggle.checked;
                
                try {
                    if (showMonochrome) {
                        const tempImg = new Image();
                        tempImg.src = animation.frames[currentFrame].dataUrl;
                        await new Promise(resolve => tempImg.onload = resolve);
                        preview.src = await Utils.previewMonochrome(tempImg);
                    } else {
                        preview.src = animation.frames[currentFrame].dataUrl;
                    }
                    
                    frameCounter.textContent = `${currentFrame + 1}/${animation.frames.length}`;
                    
                    // Update frame thumbnails selection
                    frameList.querySelectorAll('.frame-thumb').forEach((thumb, index) => {
                        thumb.classList.toggle('selected', index === currentFrame);
                    });
                } catch (error) {
                    this.updateStatus('Error updating frame display: ' + error.message, true);
                } finally {
                    container.classList.remove('loading');
                }
            };

            // Frame navigation handlers
            prevBtn.addEventListener('click', () => {
                const animation = this.imageProcessor.animations.get(name);
                if (!animation) return;
                currentFrame = (currentFrame - 1 + animation.frames.length) % animation.frames.length;
                updateFrameDisplay();
            });

            nextBtn.addEventListener('click', () => {
                const animation = this.imageProcessor.animations.get(name);
                if (!animation) return;
                currentFrame = (currentFrame + 1) % animation.frames.length;
                updateFrameDisplay();
            });

            // Add frameRate change handler
            const frameRateInput = container.querySelector('.frame-rate');
            frameRateInput.addEventListener('change', () => {
                const animation = this.imageProcessor.animations.get(name);
                if (!animation) return;
                
                const newFrameRate = parseInt(frameRateInput.value);
                this.imageProcessor.updateAnimationFrameRate(name, newFrameRate);
                
                // Restart animation if playing
                if (isPlaying) {
                    clearTimeout(animationInterval);
                    playAnimation();
                }
            });

            const playAnimation = () => {
                if (!isPlaying) return;
                
                const animation = this.imageProcessor.animations.get(name);
                if (!animation) return;
                
                currentFrame = (currentFrame + 1) % animation.frames.length;
                updateFrameDisplay();
                
                // Get fresh frameRate value and ensure it's at least 1
                const currentFrameRate = Math.max(1, animation.frameRate || 30);
                animationInterval = setTimeout(playAnimation, 1000 / currentFrameRate);
            };

            playBtn.addEventListener('click', () => {
                isPlaying = !isPlaying;
                playBtn.textContent = isPlaying ? '⏸' : '▶';
                
                if (isPlaying) {
                    playAnimation();
                } else {
                    clearTimeout(animationInterval);
                }
            });

            // Frame management buttons
            const addFramesBtn = container.querySelector('.add-frames');
            const reorderBtn = container.querySelector('.reorder-frames');
            const deleteFrameBtn = container.querySelector('.delete-frame');
            let isReorderMode = false;

            const toggleReorderMode = (enable) => {
                isReorderMode = enable;
                frameList.classList.toggle('reorder-mode', enable);
                reorderBtn.classList.toggle('active', enable);
                reorderBtn.textContent = enable ? 'Done Reordering' : 'Reorder';
                
                const frames = frameList.querySelectorAll('.frame-thumb');
                frames.forEach(frame => {
                    frame.draggable = enable;
                    frame.classList.toggle('draggable', enable);
                });
            };

            // Improved drag and drop handlers
            const handleDragStart = (e) => {
                e.target.classList.add('dragging');
                e.dataTransfer.setData('text/plain', e.target.dataset.index);
                // Add visual feedback
                frameList.querySelectorAll('.frame-thumb').forEach(thumb => {
                    if (thumb !== e.target) thumb.classList.add('drop-target');
                });
            };

            const handleDragEnd = (e) => {
                e.target.classList.remove('dragging');
                frameList.querySelectorAll('.frame-thumb').forEach(thumb => {
                    thumb.classList.remove('drop-target');
                    thumb.classList.remove('drop-hover');
                });
            };

            const handleDragOver = (e) => {
                e.preventDefault();
                const target = e.target.closest('.frame-thumb');
                if (target && !target.classList.contains('dragging')) {
                    // Remove hover state from all frames
                    frameList.querySelectorAll('.frame-thumb').forEach(thumb => {
                        thumb.classList.remove('drop-hover');
                    });
                    // Add hover state to current target
                    target.classList.add('drop-hover');
                }
            };

            const handleDrop = (e) => {
                e.preventDefault();
                const target = e.target.closest('.frame-thumb');
                if (!target) return;

                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = parseInt(target.dataset.index);
                
                if (fromIndex !== toIndex) {
                    this.imageProcessor.reorderFrames(name, fromIndex, toIndex);
                    updateFrameList();
                    updateFrameDisplay();
                }
                
                // Clean up visual states
                frameList.querySelectorAll('.frame-thumb').forEach(thumb => {
                    thumb.classList.remove('drop-target');
                    thumb.classList.remove('drop-hover');
                });
            };

            // Reorder button handler
            reorderBtn.addEventListener('click', () => {
                toggleReorderMode(!isReorderMode);
                
                if (isReorderMode) {
                    frameList.addEventListener('dragstart', handleDragStart);
                    frameList.addEventListener('dragend', handleDragEnd);
                    frameList.addEventListener('dragover', handleDragOver);
                    frameList.addEventListener('drop', handleDrop);
                } else {
                    frameList.removeEventListener('dragstart', handleDragStart);
                    frameList.removeEventListener('dragend', handleDragEnd);
                    frameList.removeEventListener('dragover', handleDragOver);
                    frameList.removeEventListener('drop', handleDrop);
                }
            });

            // Update frame list with improved interaction
            const updateFrameList = () => {
                frameList.innerHTML = '';
                const animation = this.imageProcessor.animations.get(name);
                if (!animation) return;

                animation.frames.forEach((frame, index) => {
                    const thumb = document.createElement('img');
                    thumb.src = frame.dataUrl;
                    thumb.classList.add('frame-thumb');
                    thumb.dataset.index = index;
                    thumb.title = `Frame ${index + 1}`;
                    
                    if (isReorderMode) {
                        thumb.draggable = true;
                        thumb.classList.add('draggable');
                    }
                    
                    thumb.addEventListener('click', () => {
                        if (!isReorderMode) {
                            currentFrame = index;
                            updateFrameDisplay();
                        }
                    });
                    
                    frameList.appendChild(thumb);
                });
            };

            // Add frames button handler
            addFramesBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = 'image/*';
                
                input.onchange = async (e) => {
                    try {
                        container.classList.add('loading');
                        const files = Array.from(e.target.files);
                        const processedFiles = [];
                        
                        // Process each file for correct dimensions
                        for (const file of files) {
                            const img = await createImageBitmap(file);
                            if (img.width !== 128 || img.height !== 64) {
                                const shouldResize = await this.showResizePrompt(file, img.width, img.height);
                                if (!shouldResize) continue;
                                const resized = await this.resizeImage(file);
                                processedFiles.push(resized);
                            } else {
                                processedFiles.push(file);
                            }
                        }
                        
                        if (processedFiles.length > 0) {
                            await this.imageProcessor.addFramesToAnimation(name, processedFiles);
                            this.updateFrameList(container, name);
                            updateFrameDisplay();
                            this.updateStatus('Frames added successfully!');
                        }
                    } catch (error) {
                        this.updateStatus('Error adding frames: ' + error.message, true);
                    } finally {
                        container.classList.remove('loading');
                    }
                };
                
                input.click();
            });

            // Delete frame button handler
            deleteFrameBtn.addEventListener('click', () => {
                const animation = this.imageProcessor.animations.get(name);
                if (!animation || animation.frames.length <= 1) {
                    this.updateStatus('Cannot delete the last frame!', true);
                    return;
                }

                try {
                    this.imageProcessor.deleteFrame(name, currentFrame);
                    currentFrame = Math.min(currentFrame, animation.frames.length - 1);
                    this.updateFrameList(container, name);
                    updateFrameDisplay();
                    this.updateStatus('Frame deleted successfully!');
                } catch (error) {
                    this.updateStatus('Error deleting frame: ' + error.message, true);
                }
            });

            // Monochrome toggle handler
            if (monoToggle) {
                monoToggle.addEventListener('change', async () => {
                    try {
                        container.classList.add('loading');
                        await updateFrameDisplay();
                    } catch (error) {
                        this.updateStatus('Error applying monochrome: ' + error.message, true);
                        monoToggle.checked = false;
                    } finally {
                        container.classList.remove('loading');
                    }
                });
            }

            // Initialize frame list
            this.updateFrameList(container, name);

            // Add remove button handler
            container.querySelector('.remove-btn').addEventListener('click', () => {
                this.removeAnimation(container);
            });

            return container;
        },

        updateFrameList(container, name) {
            const frameList = container.querySelector('.frame-list');
            frameList.innerHTML = '';
            
            const animation = this.imageProcessor.animations.get(name);
            if (!animation) return;

            animation.frames.forEach((frame, index) => {
                const thumb = document.createElement('img');
                thumb.src = frame.dataUrl;
                thumb.classList.add('frame-thumb');
                thumb.dataset.index = index;
                thumb.title = `Frame ${index + 1}`;
                
                thumb.addEventListener('click', () => {
                    if (!frameList.classList.contains('reorder-mode')) {
                        const currentFrame = index;
                        this.updateFrameDisplay();
                    }
                });
                
                frameList.appendChild(thumb);
            });
        },

        enableFrameDragging(frameList, name, updateCallback) {
            const frames = frameList.querySelectorAll('.frame-thumb');
            frames.forEach(frame => {
                frame.draggable = true;
                frame.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', frame.dataset.index);
                    frame.classList.add('dragging');
                });
                frame.addEventListener('dragend', () => frame.classList.remove('dragging'));
                frame.addEventListener('dragover', (e) => e.preventDefault());
                frame.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    const toIndex = parseInt(frame.dataset.index);
                    this.imageProcessor.reorderFrames(name, fromIndex, toIndex);
                    this.updateFrameList(frameList.parentElement, name);
                    updateCallback();
                });
            });
        },

        async addIconToUI(name, previewUrl) {
            const template = document.getElementById('iconItemTemplate');
            const clone = template.content.cloneNode(true);
            const container = clone.querySelector('.icon-item');
            container.dataset.name = name;
            
            // Get all required elements
            const preview = container.querySelector('img');
            const widthInput = container.querySelector('.width-input');
            const heightInput = container.querySelector('.height-input');
            const categorySelect = container.querySelector('.icon-category');
            const monoToggle = container.querySelector('.preview-mono');
            const resizeBtn = container.querySelector('.resize-btn');
            const recommendedSizeSpan = container.querySelector('.recommended-size');
            const currentSizeSpan = container.querySelector('.current-size');
            
            // Set initial loading state
            container.classList.add('loading');
            
            // Set up preview image
            preview.src = previewUrl;
            
            // Update dimensions when image loads
            preview.onload = () => {
                const currentSize = container.querySelector('.current-size');
                if (currentSize) {
                    currentSize.textContent = `${preview.naturalWidth}x${preview.naturalHeight}`;
                }
                
                // Update input values based on recommended size
                const category = categorySelect.value;
                const recommended = this.imageProcessor.recommendedSizes[category];
                if (recommended) {
                    widthInput.value = recommended.width;
                    heightInput.value = recommended.height;
                    recommendedSizeSpan.textContent = `${recommended.width}x${recommended.height}`;
                } else {
                    widthInput.value = preview.naturalWidth;
                    heightInput.value = preview.naturalHeight;
                    recommendedSizeSpan.textContent = `${preview.naturalWidth}x${preview.naturalHeight}`;
                }
                
                container.classList.remove('loading');
            };
            
            // Set up category selection
            if (categorySelect) {
                categorySelect.addEventListener('change', (e) => {
                    const selectedCategory = e.target.value;
                    const recommended = this.imageProcessor.recommendedSizes[selectedCategory];
                    
                    if (recommended) {
                        recommendedSizeSpan.textContent = `${recommended.width}x${recommended.height}`;
                        widthInput.value = recommended.width;
                        heightInput.value = recommended.height;
                    } else {
                        recommendedSizeSpan.textContent = '128x64'; // Default recommended size
                        widthInput.value = 128;
                        heightInput.value = 64;
                    }
                });
                
                // Trigger initial category selection to set recommended size
                categorySelect.dispatchEvent(new Event('change'));
            }
            
            // Set up resize functionality
            if (resizeBtn && widthInput && heightInput) {
                const updatePreview = async () => {
                    const width = parseInt(widthInput.value);
                    const height = parseInt(heightInput.value);
                    if (width > 0 && height > 0) {
                        try {
                            container.classList.add('loading');
                            const showMonochrome = monoToggle.checked;
                            const newPreviewUrl = await this.imageProcessor.resizeIcon(name, width, height, showMonochrome);
                            if (newPreviewUrl) {
                                preview.src = newPreviewUrl;
                            }
                            this.updateStatus('Icon resized successfully');
                        } catch (error) {
                            this.updateStatus('Error resizing icon: ' + error.message, true);
                        } finally {
                            container.classList.remove('loading');
                        }
                    }
                };
    
                widthInput.addEventListener('input', updatePreview);
                heightInput.addEventListener('input', updatePreview);
    
                resizeBtn.addEventListener('click', async () => {
                    const width = parseInt(widthInput.value);
                    const height = parseInt(heightInput.value);
                    if (width > 0 && height > 0) {
                        try {
                            container.classList.add('loading');
                            const showMonochrome = monoToggle.checked;
                            const newPreviewUrl = await this.imageProcessor.resizeIcon(name, width, height, showMonochrome);
                            if (newPreviewUrl) {
                                preview.src = newPreviewUrl;
                            }
                            this.updateStatus('Icon resized successfully');
                        } catch (error) {
                            this.updateStatus('Error resizing icon: ' + error.message, true);
                        } finally {
                            container.classList.remove('loading');
                        }
                    }
                });
            }
    
            // Set up monochrome preview
            if (monoToggle) {
                monoToggle.addEventListener('change', async (e) => {
                    try {
                        container.classList.add('loading');
                        const showMonochrome = e.target.checked;
                        const icon = this.imageProcessor.icons.get(name);
                        if (!icon) throw new Error('Icon not found');
                        
                        if (showMonochrome) {
                            // Store current color version if not already stored
                            if (!preview.dataset.colorSrc) {
                                preview.dataset.colorSrc = preview.src;
                            }
                            const img = preview.cloneNode(true);
                            img.src = preview.dataset.colorSrc;
                            await new Promise(resolve => img.onload = resolve);
                            preview.src = await Utils.previewMonochrome(img);
                        } else {
                            // Restore the color version
                            preview.src = preview.dataset.colorSrc;
                        }
                    } catch (error) {
                        this.updateStatus('Error applying monochrome: ' + error.message, true);
                        e.target.checked = false;
                    } finally {
                        container.classList.remove('loading');
                    }
                });
            }
    
            // Set up remove button
            const removeBtn = container.querySelector('.remove-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    this.removeIcon(container);
                });
            }
    
            // Add to document
            document.getElementById('iconList').appendChild(clone);
            return container;
        },

        removeAnimation(container) {
            const name = container.dataset.name;
            this.imageProcessor.removeAnimation(name);
            container.remove();
            this.updateStatus('Animation removed');
        },

        removeIcon(container) {
            const name = container.dataset.name;
            this.imageProcessor.removeIcon(name);
            container.remove();
            this.updateStatus('Icon removed');
        },

        async resizeIcon(name, width, height) {
            try {
                container.classList.add('loading');
                const icon = this.imageProcessor.icons.get(name);
                if (!icon) throw new Error('Icon not found');
                
                // Always resize from original image
                const newPreviewUrl = await this.imageProcessor.resizeIcon(name, width, height);
                if (newPreviewUrl) {
                    // Store the color version
                    preview.dataset.colorSrc = newPreviewUrl;
                    
                    // If monochrome is enabled, convert the new resize
                    if (monoToggle.checked) {
                        const img = preview.cloneNode(true);
                        img.src = newPreviewUrl;
                        await new Promise(resolve => img.onload = resolve);
                        preview.src = await Utils.previewMonochrome(img);
                    } else {
                        preview.src = newPreviewUrl;
                    }
                }
                this.updateStatus('Icon resized successfully');
            } catch (error) {
                this.updateStatus('Error resizing icon: ' + error.message, true);
            } finally {
                container.classList.remove('loading');
            }
        },

        updateStatus(message, isError = false) {
            const status = document.getElementById('uploadStatus');
            status.textContent = message;
            status.className = isError ? 'status-error' : 'status-success';
            
            // Clear status after 3 seconds
            setTimeout(() => {
                status.textContent = '';
                status.className = '';
            }, 3000);
        },

        async exportPack() {
            const packName = document.getElementById('packName').value;
            if (!this.validatePackName(packName)) {
                this.updateStatus('Invalid pack name', true);
                return;
            }

            try {
                const includeAnims = document.getElementById('includeAnims').checked;
                const includeIcons = document.getElementById('includeIcons').checked;
                
                const assets = {
                    animations: includeAnims ? this.imageProcessor.getAnimations() : [],
                    icons: includeIcons ? this.imageProcessor.getIcons() : []
                };

                const zip = await Utils.createZipFile(packName, assets);
                
                // Create download link
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zip);
                link.download = `${packName}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                this.updateStatus('Pack exported successfully!');
            } catch (error) {
                this.updateStatus('Error exporting pack: ' + error.message, true);
            }
        },

        // Add these helper methods to the app object
        handleDragStart(e) {
            e.target.classList.add('dragging');
            e.dataTransfer.setData('text/plain', e.target.dataset.index);
        },

        handleDragEnd(e) {
            e.target.classList.remove('dragging');
        },

        handleDragOver(e) {
            e.preventDefault();
        },

        handleDrop(e, name, updateCallback) {
            e.preventDefault();
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(e.target.dataset.index);
            
            if (fromIndex !== toIndex) {
                this.imageProcessor.reorderFrames(name, fromIndex, toIndex);
                this.updateFrameList(e.target.closest('.animation-item'), name);
                updateCallback();
            }
        }
    };

    // Initialize the app
    app.init();
});