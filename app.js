import { Utils } from './utils.js';
import { FontProcessor } from './fontProcessor.js';
import { ImageProcessor } from './imageProcessor.js';

document.addEventListener('DOMContentLoaded', () => {
    // Check if required libraries are loaded
    if (typeof opentype === 'undefined') {
        console.error('opentype.js library not loaded');
        document.getElementById('uploadStatus').innerHTML = 
            'Error: Required font libraries not loaded. Please refresh the page.';
        return;
    }

    if (typeof JSZip === 'undefined') {
        console.error('JSZip library not loaded');
        document.getElementById('uploadStatus').innerHTML = 
            'Error: Required ZIP library not loaded. Please refresh the page.';
        return;
    }

    const app = {
        fontProcessor: new FontProcessor(),
        imageProcessor: new ImageProcessor(),
        
        init() {
            // Get template references
            this.fontItemTemplate = document.getElementById('fontItemTemplate');
            if (!this.fontItemTemplate) {
                console.error('Font item template not found in HTML');
                return;
            }

            this.bindEvents();
            this.setupTabs();
            this.validatePackName();
            this.setupBetaTags();
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

            // Add this line to bind the font upload button
            document.getElementById('uploadFontsBtn').addEventListener('click', () => this.handleFontUpload());

            // Add folder upload button handler
            document.getElementById('uploadAnimsFolderBtn').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.webkitdirectory = true;
                input.directory = true;
                input.multiple = true;
                
                input.onchange = async (e) => {
                    const files = Array.from(e.target.files);
                    
                    // Filter for image files and sort by name
                    const imageFiles = files
                        .filter(file => file.type.startsWith('image/'))
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
                    
                    if (imageFiles.length === 0) {
                        this.updateStatus('No image files found in folder', true);
                        return;
                    }
                    
                    try {
                        await this.addAnimation(imageFiles);
                        this.updateStatus(`Added ${imageFiles.length} frames from folder`);
                    } catch (error) {
                        this.updateStatus('Error adding animation: ' + error.message, true);
                    }
                };
                
                input.click();
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
                // Get the currently selected category from the active tab
                const categorySelect = document.querySelector('#iconsTab .icon-category');
                let category = categorySelect ? categorySelect.value : 'Animations';
                
                // Generate name with category context
                const name = this.generateUniqueName(file.name, category);
                
                const recommendedSize = this.imageProcessor.recommendedSizes[category];
                
                // Pass the selected category to addIcon
                const previewUrl = await this.imageProcessor.addIcon(
                    name,
                    file,
                    category
                );
                
                // Add to UI
                const container = await this.addIconToUI(name, previewUrl);
                
                // Set the initial category in the UI
                const newCategorySelect = container.querySelector('.icon-category');
                if (newCategorySelect) {
                    newCategorySelect.value = category;
                    
                    // Add change listener for category updates
                    newCategorySelect.addEventListener('change', (e) => {
                        const newCategory = e.target.value;
                        this.imageProcessor.updateIconCategory(name, newCategory);
                        
                        // Update recommended size display
                        const recommendedSizeSpan = container.querySelector('.recommended-size');
                        if (recommendedSizeSpan) {
                            const newSize = this.imageProcessor.recommendedSizes[newCategory];
                            recommendedSizeSpan.textContent = `${newSize.width}x${newSize.height}`;
                        }
                    });
                }
                
                document.getElementById('iconList').appendChild(container);
                this.updateStatus('Added icon successfully');
            } catch (error) {
                this.updateStatus('Error adding icon: ' + error.message, true);
            }
        },

        generateUniqueName(originalName, category) {
            // Remove extension and clean up name
            const baseName = originalName.replace(/\.[^/.]+$/, '');
            // Remove any existing dimensions from name (like _128x64)
            const cleanName = baseName.replace(/_\d+x\d+$/, '');
            // Remove any frame numbers
            const noFrameName = cleanName.replace(/frame_\d+/i, '');
            // Sanitize remaining name
            const sanitizedName = noFrameName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            
            // Don't add category prefix if name already starts with it
            if (sanitizedName.startsWith(category.toLowerCase() + '_')) {
                return sanitizedName;
            }
            
            // Add category-specific prefixes
            switch(category) {
                case 'Passport':
                    return `passport_${sanitizedName}`;
                case 'SubGhz':
                    return `subghz_${sanitizedName}`;
                case 'RFID':
                    return `rfid_${sanitizedName}`;
                case 'iButton':
                    return `ibutton_${sanitizedName}`;
                default:
                    return `${category.toLowerCase()}_${sanitizedName}`;
            }
        },

        addAnimationToUI(name, previewUrl, frameCount) {
            const list = document.getElementById('animationList');
            const emptyState = list.querySelector('.empty-state');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
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
            const list = document.getElementById('iconList');
            const emptyState = list.querySelector('.empty-state');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
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
                const nameSelect = container.querySelector('.icon-name');
                
                const updateNameOptions = (category) => {
                    nameSelect.innerHTML = '';
                    const names = ICON_NAMES[category] || [];
                    names.forEach(name => {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        nameSelect.appendChild(option);
                    });
                    
                    // If no predefined names, enable manual input
                    if (names.length === 0) {
                        nameSelect.innerHTML = '<option value="">Custom Name</option>';
                    }
                };

                categorySelect.addEventListener('change', (e) => {
                    const selectedCategory = e.target.value;
                    updateNameOptions(selectedCategory);
                    
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
                    
                    // Store category with icon data
                    this.imageProcessor.updateIconCategory(name, selectedCategory);
                });
                
                // Add a separate name change listener
                nameSelect.addEventListener('change', (e) => {
                    const selectedName = e.target.value;
                    if (selectedName) {
                        // Don't add category prefix if name already has it
                        const newName = selectedName.includes('_') ? selectedName : `${categorySelect.value.toLowerCase()}_${selectedName}`;
                        const oldName = container.dataset.name;
                        
                        // Update the container's data attribute
                        container.dataset.name = newName;
                        
                        // Update the name in the image processor
                        this.imageProcessor.updateIconName(oldName, newName);
                    }
                });
                
                // Initial population of names
                updateNameOptions(categorySelect.value);
            }
            
            // Set up resize functionality
            if (resizeBtn && widthInput && heightInput) {
                resizeBtn.addEventListener('click', async () => {
                    const width = parseInt(widthInput.value);
                    const height = parseInt(heightInput.value);
                    if (width > 0 && height > 0) {
                        try {
                            container.classList.add('loading');
                            const showMonochrome = monoToggle.checked;
                            const currentName = container.dataset.name; // Get current name from container
                            const newPreviewUrl = await this.imageProcessor.resizeIcon(currentName, width, height, showMonochrome);
                            if (newPreviewUrl) {
                                preview.src = newPreviewUrl;
                                // Update the name with new dimensions
                                const baseName = currentName.replace(/_\d+x\d+$/, '');
                                const newName = `${baseName}_${width}x${height}`;
                                container.dataset.name = newName;
                                this.imageProcessor.updateIconName(currentName, newName);
                                currentSizeSpan.textContent = `${width}x${height}`;
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
                        const currentName = container.dataset.name; // Get current name from container
                        const icon = this.imageProcessor.icons.get(currentName);
                        if (!icon) throw new Error('Icon not found');
                        
                        if (showMonochrome) {
                            if (!preview.dataset.colorSrc) {
                                preview.dataset.colorSrc = preview.src;
                            }
                            const img = preview.cloneNode(true);
                            img.src = preview.dataset.colorSrc;
                            await new Promise(resolve => img.onload = resolve);
                            preview.src = await Utils.previewMonochrome(img);
                        } else {
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

            return container;
        },

        removeAnimation(container) {
            const name = container.dataset.name;
            this.imageProcessor.removeAnimation(name);
            container.remove();
            
            // Show empty state if no animations left
            const list = document.getElementById('animationList');
            if (list.children.length <= 1) { // Account for empty-state div
                const emptyState = list.querySelector('.empty-state');
                if (emptyState) {
                    emptyState.style.display = 'flex';
                }
            }
            this.updateStatus('Animation removed');
        },

        removeIcon(container) {
            const name = container.dataset.name;
            this.imageProcessor.removeIcon(name);
            container.remove();
            
            // Show empty state if no icons left
            const list = document.getElementById('iconList');
            if (list.children.length <= 1) { // Account for empty-state div
                const emptyState = list.querySelector('.empty-state');
                if (emptyState) {
                    emptyState.style.display = 'flex';
                }
            }
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
        },

        async handleFontUpload() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.c,.u8f,.bdf,.pcf,.ttf';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    await this.addFont(file);
                }
            };
            
            input.click();
        },

        async addFont(file) {
            try {
                const name = this.generateUniqueName(file.name, 'Fonts');
                console.log('Adding font:', { name, file });
                const previewUrl = await this.fontProcessor.addFont(name, file);
                console.log('Font added, preview URL:', previewUrl);
                const container = await this.addFontToUI(name, previewUrl);
                document.getElementById('fontList').appendChild(container);
                this.updateStatus('Added font successfully');
            } catch (error) {
                console.error('Error in addFont:', error);
                this.updateStatus('Error adding font: ' + error.message, true);
            }
        },

        async updateFontPreview(fontItem, font) {
            console.log('Starting font preview update:', { 
                fontName: fontItem.dataset.name,
                fontDataSize: font.data.length 
            });
            
            try {
                const previewContainer = fontItem.querySelector('.font-preview');
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Parse font data
                console.log('Parsing U8G2 font data...');
                const parsedFont = await this.fontProcessor.parseU8G2Font(font.data);
                console.log('Font parsed successfully:', {
                    boundingBox: parsedFont.properties.boundingBox,
                    charCount: parsedFont.chars.size
                });
                
                // Calculate dimensions for preview text
                const text = 'The quick brown fox';
                const scale = 2;  // Fixed scale for better visibility
                console.log('Preview settings:', { text, scale });
                
                let totalWidth = 0;
                let maxHeight = (parsedFont.properties.ascent + parsedFont.properties.descent) * scale;
                
                // Calculate required width based on each glyph's width and scaling
                for (const char of text) {
                    const glyph = parsedFont.chars.get(char.charCodeAt(0));
                    if (glyph) {
                        totalWidth += (glyph.bbox.width * scale) + scale;
                    }
                }
                
                console.log('Calculated preview dimensions:', {
                    totalWidth,
                    ascent: parsedFont.properties.ascent,
                    descent: parsedFont.properties.descent,
                    canvasWidth: totalWidth + 20, // 10px padding on each side
                    canvasHeight: maxHeight + 30 // Increased padding to 15px on top and bottom
                });
                
                // Set canvas dimensions with increased padding
                canvas.width = totalWidth + 30; // 10px padding on each side
                canvas.height = maxHeight + 120; // 15px padding top and bottom
                
                // Set black background
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Set white text color
                ctx.fillStyle = '#FFFFFF';
                
                // Initialize text drawing position with increased padding
                let xPos = 10;  // Start with 10px left padding
                const yPos = 15 + (parsedFont.properties.ascent * scale);  // Start with 15px top padding + ascent
                
                for (const char of text) {
                    const glyph = parsedFont.chars.get(char.charCodeAt(0));
                    if (!glyph) continue;
                    
                    this.drawGlyphBitmap(ctx, glyph, xPos, yPos, scale);
                    xPos += (glyph.bbox.width * scale) + scale; // Move to next glyph's position
                }
                
                // Clear container and add canvas
                previewContainer.innerHTML = '';
                previewContainer.appendChild(canvas);
                
                console.log('Preview generation complete');
            } catch (error) {
                console.error('Preview generation error:', error);
                throw error;
            }
        },

        drawGlyphBitmap(ctx, glyph, x, y, scale) {
            // Ensure x and y are on pixel boundaries
            const baseX = Math.round(x);
            const baseY = Math.round(y);
            const pixelSize = Math.round(scale);  // Ensure consistent pixel size

            let pixelsDrawn = 0;
            for (let py = 0; py < glyph.bbox.height; py++) {
                for (let px = 0; px < glyph.bbox.width; px++) {
                    const byteIndex = Math.floor(py * Math.ceil(glyph.bbox.width / 8) + px / 8);
                    const bitIndex = 7 - (px % 8);
                
                    const byte = Number(glyph.bitmap[byteIndex]);
                    if (byte & (1 << bitIndex)) {
                        pixelsDrawn++;
                        ctx.fillRect(
                            baseX + (px * pixelSize),
                            baseY + (py * pixelSize),
                            pixelSize,
                            pixelSize
                        );
                    }
                }
            }
        },

        handleFontSizeChange(event) {
            const fontItem = event.target.closest('.font-item');
            const fontName = fontItem.dataset.name;
            const font = this.fontProcessor.fonts.get(fontName);
            
            // Debounce the preview update
            if (this.fontSizeUpdateTimeout) {
                clearTimeout(this.fontSizeUpdateTimeout);
            }
            
            this.fontSizeUpdateTimeout = setTimeout(() => {
                if (font) {
                    this.updateFontPreview(fontItem, font);
                }
            }, 100);
        },

        async addFontToUI(name, previewUrl) {
            const list = document.getElementById('fontList');
            const emptyState = list.querySelector('.empty-state');
            if (emptyState) {
                emptyState.style.display = 'none';
            }

            const template = document.getElementById('fontItemTemplate');
            const container = template.content.cloneNode(true).querySelector('.font-item');
            container.dataset.name = name;
            
            // Set the font name in the input
            const nameInput = container.querySelector('.font-name');
            nameInput.value = name;
            
            // Set up remove button
            const removeBtn = container.querySelector('.remove-btn');
            removeBtn.addEventListener('click', () => {
                this.fontProcessor.removeFont(name);
                container.remove();
                
                // Show empty state if no fonts left
                if (list.children.length === 0) {
                    emptyState.style.display = 'flex';
                }
            });
            
            // Set up font size change handler
            const sizeSelect = container.querySelector('.font-size');
            sizeSelect.addEventListener('change', (e) => this.handleFontSizeChange(e));

            try {
                const font = this.fontProcessor.fonts.get(name);
                if (font) {
                    await this.updateFontPreview(container, font);
                }
            } catch (error) {
                console.error('Preview error:', error);
                const previewContainer = container.querySelector('.font-preview');
                previewContainer.textContent = 'Preview unavailable';
            }

            return container;
        },

        setupBetaTags() {
            // Add beta tags to font-related elements
            const fontCheckbox = document.getElementById('includeFonts');
            const fontUploadBtn = document.getElementById('uploadFontsBtn');
            
            if (fontCheckbox) {
                fontCheckbox.parentElement.innerHTML += ' <span class="beta-tag">BETA</span>';
            }
            
            if (fontUploadBtn) {
                fontUploadBtn.innerHTML += ' <span class="beta-tag">BETA</span>';
            }
        }
    };

    // Initialize the app
    app.init();
});

const ICON_NAMES = {
    Passport: [
        'passport',
        'passport_bad',
        'passport_happy',
        'passport_okay'
    ],
    RFID: [
        'RFIDDolphinReceive',
        'RFIDDolphinSend',
        'RFIDSmallChip'
    ],
    SubGhz: [
        'Cos',
        'Dynamic',
        'Fishing',
        'Lock',
        'MHz',
        'Quest',
        'Raw',
        'Sats',
        'Scanning',
        'Static',
        'Unlock',
        'Weather'
    ],
    iButton: [
        'iButtonDolphinVerySuccess',
        'iButtonKey'
    ]
};