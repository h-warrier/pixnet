// IMPORTANT: Replace this with the URL of your deployed Python backend API!
const API_ENDPOINT = "https://ai-chatbot-backend-xbng.onrender.com/api/chat";

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const btnTheme = document.getElementById('btn-theme');

let sessionId = localStorage.getItem('chatbotSessionId');
if (!sessionId) {
    sessionId = 'session_' + Date.now() + Math.random().toString(16).slice(2);
    localStorage.setItem('chatbotSessionId', sessionId);
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowPower = navigator.deviceMemory && navigator.deviceMemory <= 2;

function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);

    if (chatMessages.childElementCount > 150) {
        for (let i = 0; i < 30; i++) {
            if (chatMessages.firstChild) chatMessages.removeChild(chatMessages.firstChild);
        }
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setLoadingState(isLoading) {
    sendButton.disabled = isLoading;
    userInput.disabled = isLoading;
    userInput.placeholder = isLoading ? 'Thinking...' : 'Type your message...';
    sendButton.innerHTML = isLoading
        ? '<i class="fas fa-spinner fa-spin"></i>'
        : '<i class="fas fa-paper-plane"></i>';
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    displayMessage(message, 'user');
    userInput.value = '';
    setLoadingState(true);

    try {
        const payload = {
            message,
            session_id: sessionId
        };

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            displayMessage(`[Error: ${data.error}]`, 'bot');
        } else {
            displayMessage(data.response, 'bot');
            if (data.session_id && data.session_id !== sessionId) {
                sessionId = data.session_id;
                localStorage.setItem('chatbotSessionId', sessionId);
            }
        }
    } catch (error) {
        console.error('Fetch error:', error);
        displayMessage("Sorry, I can't connect to the server right now.", 'bot');
    } finally {
        setLoadingState(false);
        userInput.focus();
    }
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
userInput.addEventListener('input', () => {
    sendButton.disabled = userInput.value.trim() === '';
});

if (btnTheme) {
    btnTheme.addEventListener('click', () => {
        const root = document.documentElement;
        const isDark = getComputedStyle(root).getPropertyValue('--bg').trim() === '#0f1724';
        root.style.setProperty('--bg', isDark ? '#f5f7ff' : '#0f1724');
        root.style.setProperty('--bg-2', isDark ? '#edf2ff' : '#111827');
        root.style.setProperty('--text', isDark ? '#0f172a' : '#edf4ff');
        root.style.setProperty('--muted', isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(237, 244, 255, 0.72)');
        root.style.setProperty('--border', isDark ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255,255,255,0.12)');
        btnTheme.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });
}

function startAmbientMotion() {
    if (prefersReducedMotion || lowPower) return;

    const blobs = Array.from(document.querySelectorAll('.blob'));
    if (!blobs.length) return;

    let lastTs = 0;
    let active = true;

    function animate(ts) {
        if (!active) return;
        const frameInterval = 1000 / 24;
        if (ts - lastTs < frameInterval) {
            requestAnimationFrame(animate);
            return;
        }

        lastTs = ts;

        blobs.forEach((blob, index) => {
            const baseX = (index % 2 === 0 ? 1 : -1) * ((ts * 0.016) + index * 22);
            const baseY = (index % 3 === 0 ? 1 : -1) * ((ts * 0.012) + index * 18);
            blob.style.transform = `translate3d(${(baseX % 42) - 20}px, ${(baseY % 32) - 16}px, 0) scale(${1 + (index % 3) * 0.04})`;
        });

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

if (userInput.value.trim() !== '') {
    sendButton.disabled = false;
}

startAmbientMotion();
