// IMPORTANT: Replace this with the URL of your deployed Python backend API!
const API_ENDPOINT = "https://ai-chatbot-backend-xbng.onrender.com"; 

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

// A persistent ID to maintain conversation history on the server side
let sessionId = localStorage.getItem('chatbotSessionId');
if (!sessionId) {
    // Generate a unique ID for the session if one doesn't exist
    sessionId = 'session_' + Date.now() + Math.random().toString(16).slice(2);
    localStorage.setItem('chatbotSessionId', sessionId);
}

// --- Utility Functions ---

/**
 * Creates and appends a new message bubble to the chat window.
 * @param {string} message - The text content of the message.
 * @param {string} sender - 'user' or 'bot'.
 */
function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    
    // Scroll to the latest message
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Manages the loading state of the button and input.
 * @param {boolean} isLoading - True to disable and show loading, false to enable.
 */
function setLoadingState(isLoading) {
    sendButton.disabled = isLoading;
    userInput.disabled = isLoading;
    userInput.placeholder = isLoading ? "Thinking..." : "Type your message...";
    // Optionally change button icon to a spinner here
    sendButton.innerHTML = isLoading 
        ? '<i class="fas fa-spinner fa-spin"></i>' 
        : '<i class="fas fa-paper-plane"></i>';
}

// --- Main Chat Logic ---

async function sendMessage() {
    const message = userInput.value.trim();
    if (message === "") return;

    // 1. Display user message
    displayMessage(message, 'user');
    userInput.value = ''; // Clear input
    setLoadingState(true);

    try {
        // 2. Prepare request data
        const payload = {
            message: message,
            session_id: sessionId 
        };

        // 3. Send request to the Python API
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // CORS is handled on the Python server, but we must send JSON
            },
            body: JSON.stringify(payload)
        });

        // 4. Handle response
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Check for an error message from the backend
        if (data.error) {
            displayMessage(`[Error: ${data.error}]`, 'bot');
        } else {
            // Display the successful AI response
            displayMessage(data.response, 'bot');
            
            // Update session ID just in case the server sent a new one (optional)
            if (data.session_id && data.session_id !== sessionId) {
                 sessionId = data.session_id;
                 localStorage.setItem('chatbotSessionId', sessionId);
            }
        }

    } catch (error) {
        console.error('Fetch error:', error);
        displayMessage("Sorry, I can't connect to the server right now.", 'bot');
    } finally {
        // 5. Reset state
        setLoadingState(false);
        userInput.focus();
    }
}

// --- Event Listeners ---

// Send message on button click
sendButton.addEventListener('click', sendMessage);

// Send message on Enter key press
userInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Enable/Disable button based on input content
userInput.addEventListener('input', () => {
    sendButton.disabled = userInput.value.trim() === '';
});

// Initial button state check
if (userInput.value.trim() !== '') {
    sendButton.disabled = false;
}
