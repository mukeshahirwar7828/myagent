const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const chatBox = document.getElementById('chat-box');
const sendButton = document.getElementById('send-button');
const filePreviewContainer = document.getElementById('file-preview-container');
const fileNameDisplay = document.getElementById('file-name-display');
const removeFileBtn = document.getElementById('remove-file-btn');

let conversationHistory = [];
let selectedFile = null;

// File input handling
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDisplay.textContent = selectedFile.name;
        filePreviewContainer.classList.remove('hidden');
        messageInput.focus();
    }
});

removeFileBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    filePreviewContainer.classList.add('hidden');
});

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = messageInput.value.trim();

    if (!userText && !selectedFile) return;

    // Build the visual representation of the user message
    let displayContent = '';
    if (selectedFile) {
        displayContent += `<div class="msg-file-attachment">
            <svg stroke="currentColor" fill="none" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            ${escapeHTML(selectedFile.name)}
        </div>`;
    }
    if (userText) {
        displayContent += `<div>${escapeHTML(userText)}</div>`;
    }

    // Add user message to UI
    appendMessage('user', displayContent, true);

    // Disable inputs
    messageInput.value = '';
    messageInput.disabled = true;
    sendButton.disabled = true;
    fileInput.disabled = true;

    let currentUpload = selectedFile;

    // Clear preview immediately
    selectedFile = null;
    fileInput.value = '';
    filePreviewContainer.classList.add('hidden');

    // Show loading indicator
    const loadingHtml = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
    const loadingMessageId = appendMessage('ai', loadingHtml, true);

    try {
        const formData = new FormData();

        // Convert history to string and append
        formData.append('history', JSON.stringify(conversationHistory));

        // Append text message if any
        if (userText) {
            formData.append('message', userText);
        }

        // Append file if selected
        if (currentUpload) {
            formData.append('document', currentUpload);
        }

        const response = await fetch('/chat', {
            method: 'POST',
            body: formData // No Content-Type header, fetch sets it automatically with boundary for FormData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const aiText = data.message.content;

        // Update history correctly
        // We add the user's prompt (with file context if backend modified it, but backend will just return the standard format if we structured it well)
        // To keep it simple, backend will return updated history in the response, or we push what we sent.
        // Let's rely on backend returning the AI message to append.

        if (userText) {
            conversationHistory.push({ role: 'user', content: userText + (currentUpload ? ` (Context Document Provided: ${currentUpload.name})` : '') });
        } else if (currentUpload) {
            conversationHistory.push({ role: 'user', content: `(Uploaded Document: ${currentUpload.name}) Please process this.` });
        }

        conversationHistory.push(data.message);

        // Update UI
        updateMessage(loadingMessageId, formatText(aiText));

    } catch (error) {
        console.error('Error fetching chat response:', error);
        updateMessage(loadingMessageId, `<span style="color: var(--danger)">⚠️ Sorry, there was an error processing your request. Please check your API key and network.</span>`);
    } finally {
        messageInput.disabled = false;
        sendButton.disabled = false;
        fileInput.disabled = false;
        messageInput.focus();
    }
});

let messageCounter = 0;
function appendMessage(role, contentHtml, isHtml = false) {
    messageCounter++;
    const messageId = 'msg-' + Date.now() + '-' + messageCounter;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${role}-message`);
    messageDiv.id = messageId;

    const avatarHtml = role === 'ai'
        ? `<span style="font-size: 1.2rem; font-weight: bold; padding-bottom: 2px;">M</span>`
        : `U`;

    // Only escape if isHtml is false, otherwise trust the content string
    const finalContent = isHtml ? contentHtml : escapeHTML(contentHtml).replace(/\n/g, '<br>');

    messageDiv.innerHTML = `
        <div class="avatar">${avatarHtml}</div>
        <div class="message-content">${finalContent}</div>
    `;

    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    return messageId;
}

function updateMessage(messageId, contentHtml) {
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
        const contentDiv = messageDiv.querySelector('.message-content');
        contentDiv.innerHTML = contentHtml;
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

function formatText(text) {
    // Basic formatting for newlines
    let formatted = escapeHTML(text).replace(/\n/g, '<br>');

    // Basic bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Basic code block `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;">$1</code>');

    return formatted;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Initial focus
window.addEventListener('load', () => {
    setTimeout(() => {
        messageInput.focus();
    }, 100);
});
