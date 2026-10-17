// Ambient animations always enabled unless user requests reduced motion
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

const blobs = Array.from(document.querySelectorAll('.blob'));
const blobState = blobs.map((b, i) => ({
    el: b,
    x: Math.random() * 100,
    y: Math.random() * 100,
    vx: (Math.random() - 0.5) * 0.04,
    vy: (Math.random() - 0.5) * 0.04,
    hue: Math.random() * 360,
    hueSpeed: (Math.random() - 0.5) * 0.6
}));

function updateBlobs(ts, last) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const delta = last ? ts - last : 16;
    for (const s of blobState){
        s.x += s.vx * (delta/16);
        s.y += s.vy * (delta/16);
        if (s.x < -20) s.x = 120;
        if (s.x > 120) s.x = -20;
        if (s.y < -20) s.y = 120;
        if (s.y > 120) s.y = -20;
        s.hue = (s.hue + s.hueSpeed * (delta/16) + 360) % 360;
        const tx = (s.x - 50) * 2.0;
        const ty = (s.y - 50) * 1.2;
        s.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.06)`;
        s.el.style.background = `radial-gradient(circle at 40% 40%, hsla(${s.hue},90%,65%,0.36), hsla(${(s.hue+30)%360},90%,55%,0.10) 30%, transparent 60%)`;
    }
    return ts;
}

let lastFrame = 0;
function loop(ts){
    lastFrame = updateBlobs(ts, lastFrame);
    requestAnimationFrame(loop);
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    requestAnimationFrame(loop);
}

if (btnTheme){
    btnTheme.addEventListener('click', ()=>{
        const root = document.documentElement;
        const current = getComputedStyle(root).getPropertyValue('--bg').trim();
        if (current === '#0f1724'){
            root.style.setProperty('--bg','#f6f9fb');
            root.style.setProperty('--text','#0b1220');
        } else {
            root.style.setProperty('--bg','#0f1724');
            root.style.setProperty('--text','#EAF2F8');
        }
        btnTheme.querySelector('i').classList.toggle('fa-moon');
        btnTheme.querySelector('i').classList.toggle('fa-sun');
    });
}

function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    if (chatMessages.childElementCount > 200){
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
    userInput.placeholder = isLoading ? "Thinking..." : "Type your message...";
    sendButton.innerHTML = isLoading ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-paper-plane"></i>';
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

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', function(e){ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
userInput.addEventListener('input', ()=>{ sendButton.disabled = userInput.value.trim() === ''; });
if (userInput.value.trim() !== '') sendButton.disabled = false;
