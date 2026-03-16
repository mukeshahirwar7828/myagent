const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const chatBox = document.getElementById('chat-box');
const sendButton = document.getElementById('send-button');
const fileNameDisplay = document.getElementById('file-name-display');
const removeFileBtn = document.getElementById('remove-file-btn');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const filePreviewContainer = document.getElementById('file-preview-container');

// Camera Elements
const cameraBtn = document.getElementById('camera-btn');
const cameraModal = document.getElementById('camera-modal');
const closeCameraBtn = document.getElementById('close-camera-btn');
const cameraFeed = document.getElementById('camera-feed');
const cameraCanvas = document.getElementById('camera-canvas');
const captureBtn = document.getElementById('capture-btn');
let cameraStream = null;

// Sound elements
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const muteLine = document.querySelector('#sound-icon .mute-line');
const soundWaveInner = document.querySelector('#sound-icon .sound-wave');
const soundWaveOuter = document.querySelector('#sound-icon .sound-wave-outer');

let conversationHistory = [];
let selectedFile = null;
let isSoundEnabled = true;

if (soundToggleBtn && muteLine) {
    soundToggleBtn.addEventListener('click', () => {
        isSoundEnabled = !isSoundEnabled;
        if (isSoundEnabled) {
            muteLine.classList.add('hidden');
            if (soundWaveInner) soundWaveInner.classList.remove('hidden');
            if (soundWaveOuter) soundWaveOuter.classList.remove('hidden');
        } else {
            muteLine.classList.remove('hidden');
            if (soundWaveInner) soundWaveInner.classList.add('hidden');
            if (soundWaveOuter) soundWaveOuter.classList.add('hidden');
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        }
    });
}

// Speech Recognition setup (Voice Input)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

const micBtn = document.getElementById('mic-btn');
const micIcon = document.getElementById('mic-icon');

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Show results in real-time as user speaks
    recognition.lang = 'en-US'; // Default to English, though it usually infers well

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add('recording');
        micIcon.style.stroke = 'var(--danger)'; // Turn icon red
        messageInput.placeholder = "Listening...";
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // Keep existing typed text if we just appended a final chunk
        // For simplicity, we can overwrite or append. Let's append final and show interim.
        // Actually, just showing it dynamically in the input:
        if (finalTranscript) {
            // Append final text permanently
            messageInput.value = messageInput.value + (messageInput.value ? ' ' : '') + finalTranscript;
        }

        // If there's interim text, you could show it, but standard input fields don't mix well.
        // Doing a basic overwrite for interim if nothing was typed yet works best, but to avoid 
        // overwriting what they just typed, we mostly rely on final.
        // Let's at least show interim in the box and clear it on final for real-time feel. 
        if (interimTranscript) {
            // We can temporarily set the placeholder to show what they are saying
            messageInput.placeholder = interimTranscript;
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error detected: ' + event.error);
        stopRecording();
    };

    recognition.onend = () => {
        if (isRecording) {
            // It might have stopped automatically (e.g. paused too long)
            // Let's restart it if we intentionally wanted to keep it running
            // But usually, standard behavior is stopping on silence.
            stopRecording();
        }
    };

    micBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

} else {
    micBtn.style.display = 'none'; // Hide if not supported
    console.warn("Speech Recognition API not supported in this browser.");
}

function startRecording() {
    if (recognition) {
        try {
            recognition.start();
        } catch (e) { console.error(e); }
    }
}

function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('recording');
    micIcon.style.stroke = 'currentColor'; // Revert color
    messageInput.placeholder = "Ask Mukesh anything...";
    if (recognition) {
        recognition.stop();
    }
}

let audioCtx = null;
function playMessageSound(type) {
    if (!isSoundEnabled) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'send') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);

            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'receive') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);

            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);

            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.15);
        }
    } catch (e) {
        console.warn("Audio playback failed", e);
    }
}

// Text-to-Speech handling
let aiVoices = [];
function loadVoices() {
    if ('speechSynthesis' in window) {
        aiVoices = window.speechSynthesis.getVoices();
    }
}
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices(); // Initial load Attempt
}

function speakText(text) {
    if (!('speechSynthesis' in window)) return;

    // Stop and wait
    window.speechSynthesis.cancel();

    // Clean text: remove markdown asterisks and backticks for better voice reading
    const cleanText = text.replace(/\*\*/g, '').replace(/`/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Attempt to find an Indian voice for better Hinglish pronunciation.
    // Hindi (hi-IN) or Indian English (en-IN) prioritize male if available.
    let indianVoice = aiVoices.find(v => v.lang.startsWith('hi') || v.lang.startsWith('en-IN') || v.name.toLowerCase().includes('india'));
    let maleIndianVoice = aiVoices.find(v => 
        (v.lang.startsWith('hi') || v.lang.startsWith('en-IN')) && 
        (v.name.toLowerCase().includes('male') || v.name.includes('Ravi') || v.name.includes('Hemant'))
    );

    let fallbackVoice = aiVoices.find(v =>
        (v.name.toLowerCase().includes('male') ||
            v.name.includes('David') ||
            v.name.includes('Mark')) &&
        v.lang.startsWith('en')
    );

    let selectedVoice = maleIndianVoice || indianVoice || fallbackVoice || aiVoices[0];

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang; // Set lang to match the voice
    } else {
        utterance.lang = 'hi-IN'; // Hint the browser to use a Hinglish/Hindi capable engine
    }

    // Lower pitch slightly to sound more masculine as a fallback
    utterance.pitch = 0.9;
    utterance.rate = 1.0;

    window.speechSynthesis.speak(utterance);
}

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

    // Stop recording if active upon sending
    if (isRecording) {
        stopRecording();
    }

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
    playMessageSound('send');

    // Disable buttons but leave input active so user can type next msg
    messageInput.value = '';
    sendButton.disabled = true;
    fileInput.disabled = true;

    let currentUpload = selectedFile;

    // Clear preview immediately
    selectedFile = null;
    fileInput.value = '';
    filePreviewContainer.classList.add('hidden');

    // Add to History Panel
    addHistoryItem(userText || (currentUpload ? `Uploaded: ${currentUpload.name}` : 'Unknown Request'));

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
        playMessageSound('receive');

        // Auto-play TTS if sound is enabled globally
        if (isSoundEnabled) {
            speakText(aiText);
        }

    } catch (error) {
        console.error('Error fetching chat response:', error);
        updateMessage(loadingMessageId, `<span style="color: var(--danger)">⚠️ Sorry, there was an error processing your request. Please check your API key and network.</span>`);
    } finally {
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
    let finalContent = isHtml ? contentHtml : escapeHTML(contentHtml).replace(/\n/g, '<br>');

    // Optional: Add a TTS read button for AI messages
    let readButtonHtml = '';
    if (role === 'ai') {
        readButtonHtml = `
            <button class="read-aloud-btn" title="Read message aloud" onclick="speakText(this.parentElement.querySelector('.message-text').innerText || this.parentElement.querySelector('.message-text').textContent)">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
            </button>
        `;
    }

    messageDiv.innerHTML = `
        <div class="avatar">${avatarHtml}</div>
        <div class="message-content">
            <div class="message-text">${finalContent}</div>
            ${readButtonHtml}
        </div>
    `;

    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    return messageId;
}

function updateMessage(messageId, contentHtml) {
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
        const textDiv = messageDiv.querySelector('.message-text');
        if (textDiv) {
            textDiv.innerHTML = contentHtml;
        } else {
            // Fallback if structure is somehow missing
            const contentDiv = messageDiv.querySelector('.message-content');
            if (contentDiv) contentDiv.innerHTML = contentHtml;
        }
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

// Sidebar History logic
function addHistoryItem(text) {
    if (!historyList) return;

    const historyItemDiv = document.createElement('div');
    historyItemDiv.classList.add('history-item');
    historyItemDiv.style.display = 'flex';
    historyItemDiv.style.justifyContent = 'space-between';
    historyItemDiv.style.alignItems = 'center';
    
    const textSpan = document.createElement('span');
    // Truncate text if it's too long
    const displayText = text.length > 40 ? text.substring(0, 37) + '...' : text;
    textSpan.textContent = displayText;
    textSpan.title = text; // Tooltip shows full text
    textSpan.style.cursor = 'pointer';
    textSpan.style.flex = '1';
    textSpan.style.overflow = 'hidden';
    textSpan.style.textOverflow = 'ellipsis';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '&times;';
    deleteBtn.classList.add('item-delete-btn');
    deleteBtn.title = "Delete this item";

    // Simple click event to re-insert text into input
    textSpan.addEventListener('click', () => {
        messageInput.value = text;
        messageInput.focus();
    });

    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        historyItemDiv.remove();
    });

    historyItemDiv.appendChild(textSpan);
    historyItemDiv.appendChild(deleteBtn);

    // Append so oldest is at the top ("first wise first")
    historyList.appendChild(historyItemDiv);
}

if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
        historyList.innerHTML = '';
    });
}

// --- Webcam Capture Logic ---
async function openCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: false 
        });
        cameraFeed.srcObject = cameraStream;
        cameraModal.classList.remove('hidden');
        cameraCanvas.classList.add('hidden'); // Ensure canvas is hidden when feed starts
    } catch (err) {
        console.error("Error accessing webcam: ", err);
        alert("Unable to access the camera. Please ensure permissions are granted.");
    }
}

function closeCamera() {
    cameraModal.classList.add('hidden');
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    cameraFeed.srcObject = null;
    cameraCanvas.classList.add('hidden');
}

function capturePhoto() {
    if (!cameraStream) return;
    
    // Set canvas dimensions to match video feed
    cameraCanvas.width = cameraFeed.videoWidth;
    cameraCanvas.height = cameraFeed.videoHeight;
    const ctx = cameraCanvas.getContext('2d');
    
    // Draw the current video frame onto the canvas 
    // We flip it horizontally so it matches the mirrored preview
    ctx.translate(cameraCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cameraFeed, 0, 0, cameraCanvas.width, cameraCanvas.height);
    
    // Convert canvas to a File object
    cameraCanvas.toBlob((blob) => {
        if (!blob) return;
        
        // Create a fake File object from the Blob
        selectedFile = new File([blob], `webcam_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        // Update UI
        fileNameDisplay.textContent = selectedFile.name;
        filePreviewContainer.classList.remove('hidden');
        closeCamera();
        messageInput.focus();
    }, 'image/jpeg', 0.9);
}

if (cameraBtn) cameraBtn.addEventListener('click', openCamera);
if (closeCameraBtn) closeCameraBtn.addEventListener('click', closeCamera);
if (captureBtn) captureBtn.addEventListener('click', capturePhoto);

// Initial focus
window.addEventListener('load', () => {
    setTimeout(() => {
        messageInput.focus();
    }, 100);
});
