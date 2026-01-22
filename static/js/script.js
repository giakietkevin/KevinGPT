// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const historyList = document.getElementById('historyList');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const filePreviewContainer = document.getElementById('filePreviewContainer');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const modelSelect = document.getElementById('modelSelect');
const imageSizePill = document.getElementById('imageSizePill');
const imageSizeSelect = document.getElementById('imageSizeSelect');
const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');
const imageModal = document.getElementById('imageModal');
const imageModalBackdrop = document.getElementById('imageModalBackdrop');
const imageModalClose = document.getElementById('imageModalClose');
const imageModalImg = document.getElementById('imageModalImg');

// State
let conversationHistory = [];
let currentConversation = [];
let isWaitingForResponse = false;
let attachedFiles = []; // { file, type, base64, name, size }
let editingTurnId = null;

function newTurnId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadChatHistory();
    setupEventListeners();
    autoResizeTextarea();
    setupShellUI();
    startHealthCheck();
});

function setupShellUI() {
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            // On mobile use sidebar-open, on desktop use sidebar-collapsed
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) {
                document.body.classList.toggle('sidebar-open');
            } else {
                document.body.classList.toggle('sidebar-collapsed');
            }
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            document.body.classList.remove('sidebar-open');
        });
    }

    const syncImageUI = () => {
        const m = modelSelect?.value || '';
        const isImage = m.startsWith('gemini-3-pro-image');
        if (imageSizePill) imageSizePill.style.display = isImage ? 'flex' : 'none';
        // When generating images, attachments are typically not supported in this demo
        if (attachBtn) attachBtn.disabled = isImage;
        if (attachBtn) attachBtn.style.opacity = isImage ? '0.4' : '';
    };

    modelSelect?.addEventListener('change', syncImageUI);
    syncImageUI();

    // Image modal events
    const closeModal = () => {
        if (!imageModal) return;
        imageModal.classList.remove('is-open');
        imageModal.setAttribute('aria-hidden', 'true');
        if (imageModalImg) imageModalImg.src = '';
    };

    imageModalBackdrop?.addEventListener('click', closeModal);
    imageModalClose?.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

function openImageModal(src) {
    if (!imageModal || !imageModalImg) return;
    imageModalImg.src = src;
    imageModal.classList.add('is-open');
    imageModal.setAttribute('aria-hidden', 'false');
}

function setConnStatus(status) {
    if (!connDot || !connText) return;
    connDot.classList.remove('ok', 'bad', 'warn');
    if (status === 'ok') {
        connDot.classList.add('ok');
        connText.textContent = 'Online';
    } else if (status === 'bad') {
        connDot.classList.add('bad');
        connText.textContent = 'Offline';
    } else {
        connDot.classList.add('warn');
        connText.textContent = 'Connecting';
    }
}

async function startHealthCheck() {
    setConnStatus('warn');
    const ping = async () => {
        try {
            const res = await fetch('/api/health', { method: 'GET' });
            setConnStatus(res.ok ? 'ok' : 'bad');
        } catch {
            setConnStatus('bad');
        }
    };
    await ping();
    setInterval(ping, 5000);
}

// Event Listeners
function setupEventListeners() {
    sendBtn.addEventListener('click', sendMessage);
    newChatBtn.addEventListener('click', startNewChat);
    
    messageInput.addEventListener('input', () => {
        updateSendButtonState();
        autoResizeTextarea();
    });
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) {
                sendMessage();
            }
        }
    });
    
    // File attach
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    const inputWrapper = document.querySelector('.input-wrapper');
    inputWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        inputWrapper.style.borderColor = '#4a4a4a';
    });
    inputWrapper.addEventListener('dragleave', () => {
        inputWrapper.style.borderColor = '';
    });
    inputWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        inputWrapper.style.borderColor = '';
        handleFiles(e.dataTransfer.files);
    });
    
    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const suggestion = chip.getAttribute('data-suggestion');
            messageInput.value = suggestion;
            updateSendButtonState();
            sendMessage();
        });
    });
}

// Update send button state
function updateSendButtonState() {
    const hasMessage = messageInput.value.trim() !== '';
    const hasFiles = attachedFiles.length > 0;
    sendBtn.disabled = (!hasMessage && !hasFiles) || isWaitingForResponse;
}

// Handle file selection
function handleFileSelect(e) {
    handleFiles(e.target.files);
    fileInput.value = ''; // Reset để có thể chọn lại file giống
}

// Handle files
function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (attachedFiles.length >= 5) {
            alert('Chỉ có thể đính kèm tối đa 5 file!');
            return;
        }
        
        const isImage = file.type.startsWith('image/');
        const fileData = {
            file: file,
            type: isImage ? 'image' : 'file',
            name: file.name,
            size: formatFileSize(file.size)
        };
        
        // Convert to base64
        const reader = new FileReader();
        reader.onload = (e) => {
            fileData.base64 = e.target.result;
            attachedFiles.push(fileData);
            renderFilePreview();
            updateSendButtonState();
        };
        reader.readAsDataURL(file);
    });
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Render file preview
function renderFilePreview() {
    filePreviewContainer.innerHTML = '';
    
    attachedFiles.forEach((fileData, index) => {
        const item = document.createElement('div');
        item.className = 'file-preview-item' + (fileData.type === 'image' ? ' image-preview' : '');
        
        if (fileData.type === 'image') {
            item.innerHTML = `
                <img src="${fileData.base64}" alt="${fileData.name}">
                <button class="remove-file" onclick="removeFile(${index})">×</button>
            `;
        } else {
            item.innerHTML = `
                <div class="file-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${fileData.name}</div>
                    <div class="file-size">${fileData.size}</div>
                </div>
                <button class="remove-file" onclick="removeFile(${index})">×</button>
            `;
        }
        
        filePreviewContainer.appendChild(item);
    });
}

// Remove file
function removeFile(index) {
    attachedFiles.splice(index, 1);
    renderFilePreview();
    updateSendButtonState();
}

// Auto-resize textarea
function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
}

// Send Message
async function sendMessage() {
    const message = messageInput.value.trim();
    const hasFiles = attachedFiles.length > 0;
    
    if ((!message && !hasFiles) || isWaitingForResponse) return;
    
    // Lưu files trước khi clear
    const filesToSend = [...attachedFiles];
    const imageAttachments = filesToSend.filter(f => f.type === 'image');
    const fileAttachments = filesToSend.filter(f => f.type === 'file');

    // Nếu đang edit: cập nhật message user hiện tại và regenerate AI ngay dưới nó
    const isEditing = Boolean(editingTurnId);
    const turnId = isEditing ? editingTurnId : newTurnId();

    let userMessageDiv = null;
    if (isEditing) {
        userMessageDiv = chatContainer.querySelector(`.message.user[data-turn-id="${turnId}"]`);
        if (userMessageDiv) {
            renderMessageIntoDiv(userMessageDiv, 'user', message, filesToSend, turnId);
        }
        // Xóa AI message cũ của turn này (để regen)
        const oldAi = chatContainer.querySelector(`.message.ai[data-turn-id="${turnId}"]`);
        if (oldAi) oldAi.remove();
    } else {
        // Add user message to UI với attachments
        userMessageDiv = addMessageWithAttachments('user', message, filesToSend, true, turnId);
    }
    
    // Clear input và files
    messageInput.value = '';
    attachedFiles = [];
    renderFilePreview();
    sendBtn.disabled = true;
    autoResizeTextarea();

    // Tạo khung tin nhắn AI rỗng để stream nội dung dần dần
    const { textElement, messageDiv } = createStreamingMessage('ai', turnId, userMessageDiv);

    // Show typing indicator tạm thời
    const typingId = showTypingIndicator();
    isWaitingForResponse = true;

    try {
        // Chuẩn bị data gửi đi
        const selectedModel = modelSelect?.value || 'gemini-3-pro-high';

        // If image generation model selected -> call /api/image (non-stream) and render image
        if (selectedModel.startsWith('gemini-3-pro-image')) {
            removeTypingIndicator(typingId);
            const size = imageSizeSelect?.value || '1024x1024';
            const img = await generateImage({ prompt: message, size, model: selectedModel });
            if (img?.success && img.image_data_url) {
                // Update AI message to show the generated image
                // Replace streaming placeholder with an attachment
                const aiMsg = messageDiv;
                renderMessageIntoDiv(aiMsg, 'ai', '', [{ type: 'image', name: 'generated.png', base64: img.image_data_url }], turnId);
                // Save to current conversation
                currentConversation.push({
                    turnId,
                    role: 'ai',
                    content: '',
                    attachments: [{ type: 'image', name: 'generated.png', base64: img.image_data_url }],
                });
            } else {
                textElement.textContent = img?.error || 'Không tạo được ảnh. Vui lòng thử lại.';
            }
            saveToHistory(message || 'Tạo ảnh');
            return;
        }

        const requestData = { 
            message: message || 'Phân tích nội dung đính kèm',
            images: imageAttachments.map(f => f.base64),
            files: fileAttachments.map(f => ({ name: f.name, content: f.base64 })),
            model: selectedModel || undefined,
        };
        
        const response = await fetch('/api/chat-stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        // Nếu server không hỗ trợ stream
        if (!response.ok || !response.body) {
            removeTypingIndicator(typingId);
            textElement.textContent = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.';
            return;
        }

        // Bắt đầu đọc từng chunk
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let aiText = '';

        // Bỏ typing indicator khi đã nhận được phản hồi
        removeTypingIndicator(typingId);

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            aiText += chunk;
            textElement.textContent = aiText;
            scrollToBottom();
        }

        // Lưu lịch sử sau khi nhận xong
        saveToHistory(message || 'Phân tích file/hình ảnh');
    } catch (error) {
        removeTypingIndicator(typingId);
        textElement.textContent = 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối của bạn.';
        console.error('Error:', error);
    } finally {
        isWaitingForResponse = false;
        sendBtn.disabled = false;
        messageInput.focus();
        editingTurnId = null;
    }
}

async function generateImage({ prompt, size, model }) {
    try {
        const res = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, size, model }),
        });
        const data = await res.json();
        // If server returns a URL, use it too
        if (data?.success && !data.image_data_url && data.image_url) {
            // Represent url as a clickable message if no data url
            data.image_data_url = data.image_url;
        }
        return data;
    } catch (e) {
        return { success: false, error: 'Không thể kết nối đến server.' };
    }
}

// Add Message to UI
function addMessage(role, content, saveToConversation = true) {
    addMessageWithAttachments(role, content, [], saveToConversation);
}

// Add Message with Attachments
function addMessageWithAttachments(role, content, attachments = [], saveToConversation = true, turnId = null) {
    const resolvedTurnId = turnId || newTurnId();
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.dataset.turnId = resolvedTurnId;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Actions for user messages: Copy + Edit
    if (role === 'user') {
        const actions = document.createElement('div');
        actions.className = 'message-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-action-btn';
        copyBtn.title = 'Copy';
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="11" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                <rect x="4" y="4" width="11" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
            </svg>
        `;
        copyBtn.onclick = () => copyMessage(content);

        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action-btn';
        editBtn.title = 'Edit';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="currentColor" stroke-width="2"/>
                <path d="M14.06 6.19l2.75-2.75 3.75 3.75-2.75 2.75" stroke="currentColor" stroke-width="2"/>
            </svg>
        `;
        const attachmentsSnapshot = attachments.map(a => ({ type: a.type, name: a.name, base64: a.base64 }));
        editBtn.onclick = () => beginEdit(resolvedTurnId, content, attachmentsSnapshot);

        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        bubble.appendChild(actions);
    }
    
    // Add attachments
    if (attachments && attachments.length > 0) {
        const attachmentsDiv = document.createElement('div');
        attachmentsDiv.className = 'message-attachments';
        
        attachments.forEach(att => {
            if (att.type === 'image') {
                const img = document.createElement('img');
                img.src = att.base64;
                img.alt = att.name;
                img.onclick = () => openImageModal(att.base64);
                attachmentsDiv.appendChild(img);
            } else {
                const fileDiv = document.createElement('div');
                fileDiv.className = 'message-attachment-file';
                fileDiv.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2"/>
                        <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    <span>${att.name}</span>
                `;
                attachmentsDiv.appendChild(fileDiv);
            }
        });
        
        bubble.appendChild(attachmentsDiv);
    }
    
    // Add text
    if (content || role === 'ai') {
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = content || '';
        bubble.appendChild(text);
    }
    
    messageContent.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
    
    // Remove welcome screen if exists
    const welcomeScreen = chatContainer.querySelector('.welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.remove();
    }
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    
    // Save to current conversation
    if (saveToConversation) {
        currentConversation.push({ 
            turnId: resolvedTurnId,
            role, 
            content,
            attachments: attachments.map(a => ({ type: a.type, name: a.name, base64: a.base64 }))
        });
    }
    
    // Animate message appearance
    setTimeout(() => {
        messageDiv.style.opacity = '1';
    }, 10);

    return messageDiv;
}

// Tạo message AI rỗng để stream nội dung
function createStreamingMessage(role, turnId, insertAfterDiv) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    if (turnId) messageDiv.dataset.turnId = turnId;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = '';

    bubble.appendChild(text);
    messageContent.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);

    // Remove welcome screen nếu còn
    const welcomeScreen = chatContainer.querySelector('.welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.remove();
    }

    if (insertAfterDiv && insertAfterDiv.parentNode === chatContainer) {
        chatContainer.insertBefore(messageDiv, insertAfterDiv.nextSibling);
    } else {
        chatContainer.appendChild(messageDiv);
    }
    scrollToBottom();

    setTimeout(() => {
        messageDiv.style.opacity = '1';
    }, 10);

    return { textElement: text, messageDiv };
}

// Copy message content
function copyMessage(text) {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {
        // fallback: do nothing
    });
}

function beginEdit(turnId, text, attachments = []) {
    editingTurnId = turnId;
    messageInput.value = text || '';
    attachedFiles = attachments.map(a => ({ ...a }));
    renderFilePreview();
    updateSendButtonState();
    autoResizeTextarea();
    messageInput.focus();
}

function renderMessageIntoDiv(messageDiv, role, content, attachments, turnId) {
    // Rebuild message bubble content while keeping the outer div
    messageDiv.className = `message ${role}`;
    if (turnId) messageDiv.dataset.turnId = turnId;

    const bubble = messageDiv.querySelector('.message-bubble');
    if (!bubble) return;
    bubble.innerHTML = '';

    if (role === 'user') {
        const actions = document.createElement('div');
        actions.className = 'message-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-action-btn';
        copyBtn.title = 'Copy';
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="11" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                <rect x="4" y="4" width="11" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
            </svg>
        `;
        copyBtn.onclick = () => copyMessage(content);

        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action-btn';
        editBtn.title = 'Edit';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="currentColor" stroke-width="2"/>
                <path d="M14.06 6.19l2.75-2.75 3.75 3.75-2.75 2.75" stroke="currentColor" stroke-width="2"/>
            </svg>
        `;
        const attachmentsSnapshot = (attachments || []).map(a => ({ type: a.type, name: a.name, base64: a.base64 }));
        editBtn.onclick = () => beginEdit(turnId, content, attachmentsSnapshot);

        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        bubble.appendChild(actions);
    }

    if (attachments && attachments.length > 0) {
        const attachmentsDiv = document.createElement('div');
        attachmentsDiv.className = 'message-attachments';

        attachments.forEach(att => {
            if (att.type === 'image') {
                const img = document.createElement('img');
                img.src = att.base64;
                img.alt = att.name;
                img.onclick = () => openImageModal(att.base64);
                attachmentsDiv.appendChild(img);
            } else {
                const fileDiv = document.createElement('div');
                fileDiv.className = 'message-attachment-file';
                fileDiv.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2"/>
                        <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    <span>${att.name}</span>
                `;
                attachmentsDiv.appendChild(fileDiv);
            }
        });

        bubble.appendChild(attachmentsDiv);
    }

    if (role === 'ai') {
        // Ensure at least an empty text node exists for layout consistency
        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = content || '';
        bubble.appendChild(textEl);
        return;
    }

    if (content) {
        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = content;
        bubble.appendChild(textEl);
    }
}

// Show Typing Indicator
function showTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';
    messageDiv.id = 'typing-indicator';
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        typingDiv.appendChild(dot);
    }
    
    bubble.appendChild(typingDiv);
    messageContent.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    
    return 'typing-indicator';
}

// Remove Typing Indicator
function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) {
        indicator.remove();
    }
}

// Scroll to Bottom
function scrollToBottom() {
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });
}

// Start New Chat
function startNewChat() {
    if (confirm('Bạn có chắc muốn bắt đầu cuộc trò chuyện mới?')) {
        chatContainer.innerHTML = `
            <div class="welcome-screen">
                <div class="welcome-content">
                    <div class="welcome-icon">
                        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                            <circle cx="40" cy="40" r="38" stroke="url(#welcomeGradient)" stroke-width="2"/>
                            <path d="M25 40L35 50L55 30" stroke="url(#welcomeGradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                            <defs>
                                <linearGradient id="welcomeGradient" x1="0" y1="0" x2="80" y2="80">
                                    <stop offset="0%" stop-color="#667eea"/>
                                    <stop offset="100%" stop-color="#764ba2"/>
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <h2>Chào mừng đến với FakeGemini</h2>
                    <p>Tôi có thể giúp bạn trả lời câu hỏi, viết nội dung, phân tích dữ liệu và nhiều hơn nữa.</p>
                    <div class="suggestions">
                        <button class="suggestion-chip" data-suggestion="Giải thích về AI là gì?">
                            Giải thích về AI là gì?
                        </button>
                        <button class="suggestion-chip" data-suggestion="Viết một bài thơ về công nghệ">
                            Viết một bài thơ về công nghệ
                        </button>
                        <button class="suggestion-chip" data-suggestion="Làm thế nào để học lập trình?">
                            Làm thế nào để học lập trình?
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Re-attach suggestion chip listeners
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const suggestion = chip.getAttribute('data-suggestion');
                messageInput.value = suggestion;
                sendBtn.disabled = false;
                sendMessage();
            });
        });
        
        // Chỉ reset cuộc trò chuyện hiện tại, GIỮ NGUYÊN lịch sử
        currentConversation = [];
        editingTurnId = null;
        messageInput.value = '';
        sendBtn.disabled = true;
    }
}

// Save to History
function saveToHistory(message) {
    const historyItem = {
        id: Date.now(),
        title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        // deep-ish copy to avoid mutation bugs
        messages: currentConversation.map(m => ({
            turnId: m.turnId,
            role: m.role,
            content: m.content,
            attachments: m.attachments || []
        })),
        timestamp: new Date()
    };
    
    conversationHistory.unshift(historyItem);
    if (conversationHistory.length > 20) {
        conversationHistory.pop();
    }
    
    updateHistoryUI();
    saveChatHistory();
}

// Update History UI
function updateHistoryUI() {
    historyList.innerHTML = '';
    conversationHistory.forEach(item => {
        const historyItemWrapper = document.createElement('div');
        historyItemWrapper.className = 'history-item-wrapper';
        
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.textContent = item.title;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'history-delete-btn';
        deleteBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        deleteBtn.title = 'Xóa đoạn chat';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteConversation(item.id);
        };
        
        historyItem.addEventListener('click', () => {
            loadConversation(item);
        });
        
        historyItemWrapper.appendChild(historyItem);
        historyItemWrapper.appendChild(deleteBtn);
        historyList.appendChild(historyItemWrapper);
    });
}

// Load Conversation
function loadConversation(historyItem) {
    // Clear current chat
    chatContainer.innerHTML = '';
    currentConversation = [];
    editingTurnId = null;
    
    // Load messages
    if (historyItem.messages && historyItem.messages.length > 0) {
        // Ensure each message has a turnId
        let fallbackTurn = null;
        historyItem.messages.forEach(msg => {
            if (!msg.turnId) {
                // Pair user+ai into same turn if possible (best-effort)
                if (msg.role === 'user') fallbackTurn = newTurnId();
                msg.turnId = fallbackTurn || newTurnId();
            }

            addMessageWithAttachments(msg.role, msg.content, msg.attachments || [], false, msg.turnId);
            currentConversation.push({ 
                turnId: msg.turnId,
                role: msg.role, 
                content: msg.content,
                attachments: msg.attachments || []
            });
        });
    }
    
    messageInput.focus();
}

// Delete Conversation
function deleteConversation(id) {
    if (confirm('Bạn có chắc muốn xóa đoạn chat này?')) {
        conversationHistory = conversationHistory.filter(item => item.id !== id);
        updateHistoryUI();
        saveChatHistory();
    }
}

// Load Chat History
function loadChatHistory() {
    const saved = localStorage.getItem('fakegemini_history');
    if (saved) {
        conversationHistory = JSON.parse(saved);
        updateHistoryUI();
    }
}

// Save Chat History
function saveChatHistory() {
    localStorage.setItem('fakegemini_history', JSON.stringify(conversationHistory));
}

