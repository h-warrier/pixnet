// IMPORTANT: Replace this with the URL of your deployed Python backend API!
const API_ENDPOINT = "https://ai-chatbot-backend-xbng.onrender.com/api/chat"; 

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const btnTheme = document.getElementById('btn-theme');

// A persistent ID to maintain conversation history on the server side
let sessionId = localStorage.getItem('chatbotSessionId');
if (!sessionId) {
    sessionId = 'session_' + Date.now() + Math.random().toString(16).slice(2);
    localStorage.setItem('chatbotSessionId', sessionId);
}

// Simple performance heuristics
const deviceMemory = navigator.deviceMemory || 4; // GB (approx)
const lowEndDevice = deviceMemory <= 1.5 || /Mobi|Android|Phone/.test(navigator.userAgent) && deviceMemory <= 2;
let lastAnimationFrame = 0;
const TARGET_FPS = lowEndDevice ? 20 : 30; // cap fps for animations
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// Lightweight ambient blob animation using CSS variables
const blobs = Array.from(document.querySelectorAll('.blob'));
// Initialize random velocities and hue offsets for each blob
const blobState = blobs.map((b, i) => ({
    el: b,
    x: Math.random() * 100,
    y: Math.random() * 100,
    vx: (Math.random() - 0.5) * 0.02,
    vy: (Math.random() - 0.5) * 0.02,
    hue: Math.random() * 360,
    hueSpeed: (Math.random() - 0.5) * 0.2
}));

function updateBlobs(ts){
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (!lastAnimationFrame) lastAnimationFrame = ts;
    const delta = ts - lastAnimationFrame;
    if (delta < FRAME_INTERVAL) return;
    lastAnimationFrame = ts;

    for (const s of blobState){
        // update position
        s.x += s.vx * (delta/16);
        s.y += s.vy * (delta/16);
        // wrap around bounds
        if (s.x < -20) s.x = 120;
        if (s.x > 120) s.x = -20;
        if (s.y < -20) s.y = 120;
        if (s.y > 120) s.y = -20;
        // update hue
        s.hue = (s.hue + s.hueSpeed * (delta/16) + 360) % 360;
        // apply transform and color shift using background with hsl overlay
        const tx = (s.x - 50) * 1.6; // subtle movement scale
        const ty = (s.y - 50) * 1.1;
        s.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.02)`;
        // tint via CSS filter for lower cost (avoid expensive paint operations)
        s.el.style.background = `radial-gradient(circle at 40% 40%, hsla(${s.hue},90%,65%,0.36), hsla(${(s.hue+30)%360},90%,55%,0.10) 30%, transparent 60%)`;
    }
    // Schedule next frame
    requestAnimationFrame(updateBlobs);
}

// Start animations adaptively
function startAmbient(){
    if (blobs.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // For very low-end devices avoid rAF storms by running the loop at capped FPS
    requestAnimationFrame(updateBlobs);
}

// Theme toggle (light/dark glass subtle change)
let dark = true;
if (btnTheme){
    btnTheme.addEventListener('click', ()=>{
        dark = !dark;
        document.documentElement.style.setProperty('--bg', dark ? '#0f1724' : '#f6f9fb');
        document.documentElement.style.setProperty('--text', dark ? '#EAF2F8' : '#0b1220');
        // blush effect
        btnTheme.querySelector('i').classList.toggle('fa-sun', !dark);
        btnTheme.querySelector('i').classList.toggle('fa-moon', dark);
    });
}

// --- Chat functions (kept lightweight) ---

function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    // simple sanitization
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    // maintain chat size reasonable
    if (chatMessages.childElementCount > 200){
        // remove oldest messages to keep DOM small
        const removeCount = 40;
        for (let i=0;i<removeCount;i++){
            if (chatMessages.firstChild) chatMessages.removeChild(chatMessages.firstChild);
        }
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setLoadingState(isLoading) {
    sendButton.disabled = isLoading;
    userInput.disabled = isLoading;
    userInput.placeholder = isLoading ? "Thinking..." : "Type your message... (Enter to send, Ctrl+Enter for newline)";
    sendButton.innerHTML = isLoading 
        ? '<i class="fas fa-spinner fa-spin"></i>' 
        : '<i class="fas fa-paper-plane"></i>';
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (message === "") return;
    displayMessage(message, 'user');
    userInput.value = '';
    setLoadingState(true);

    try {
        const payload = { message: message, session_id: sessionId };
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.error) displayMessage(`[Error: ${data.error}]`, 'bot');
        else displayMessage(data.response, 'bot');
        if (data.session_id && data.session_id !== sessionId){ sessionId = data.session_id; localStorage.setItem('chatbotSessionId', sessionId); }
    } catch (err){
        console.error('Fetch error:', err);
        displayMessage("Sorry, I can't connect to the server right now.", 'bot');
    } finally {
        setLoadingState(false);
        userInput.focus();
    }
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', function(e){ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
userInput.addEventListener('input', ()=>{ sendButton.disabled = userInput.value.trim() === ''; });

// Init
if (userInput.value.trim() !== '') sendButton.disabled = false;
startAmbient();
