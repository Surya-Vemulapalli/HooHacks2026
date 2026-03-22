const chatWidget      = document.getElementById("chat-widget");
const chatPanel       = document.getElementById("chat-panel");
const chatToggleBtn   = document.getElementById("chat-toggle");
const chatMessages    = document.getElementById("chat-messages");
const chatInput       = document.getElementById("chat-input");
const chatSendBtn     = document.getElementById("chat-send");
const chatClearBtn    = document.getElementById("chat-clear");
const chatMinimizeBtn = document.getElementById("chat-minimize");
const chatBadge       = document.getElementById("chat-badge");
const chatSuggestions = document.getElementById("chat-suggestions");

let chatHistory  = [];   // [{role, content}]
let chatOpen     = false;
let chatMinimized = false;

// Toggle open/close
chatToggleBtn.addEventListener("click", () => {
  chatOpen = !chatOpen;
  chatWidget.classList.toggle("open", chatOpen);
  chatPanel.hidden = !chatOpen;
  if (chatOpen) {
    chatBadge.hidden = true;
    // Restore if was minimized
    chatPanel.classList.remove("minimized");
    chatWidget.classList.remove("minimized");
    chatMinimized = false;
    chatInput.focus();
    scrollToBottom();
  }
});

// Drag to reposition
(function () {
  const header = chatWidget.querySelector(".chat-header");
  let dragging = false, startX, startY, startLeft, startTop;

  header.addEventListener("mousedown", (e) => {
    // Don't drag when clicking buttons inside the header
    if (e.target.closest("button")) return;

    dragging = true;
    const rect = chatWidget.getBoundingClientRect();

    // Switch from bottom/right to top/left so we can move freely
    chatWidget.style.left   = rect.left + "px";
    chatWidget.style.top    = rect.top  + "px";
    chatWidget.style.right  = "auto";
    chatWidget.style.bottom = "auto";

    startX    = e.clientX;
    startY    = e.clientY;
    startLeft = rect.left;
    startTop  = rect.top;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const newLeft = Math.max(0, Math.min(window.innerWidth  - chatWidget.offsetWidth,  startLeft + dx));
    const newTop  = Math.max(0, Math.min(window.innerHeight - chatWidget.offsetHeight, startTop  + dy));

    chatWidget.style.left = newLeft + "px";
    chatWidget.style.top  = newTop  + "px";
  });

  document.addEventListener("mouseup", () => { dragging = false; });
})();

// Minimize / maximize
function setMinimized(state) {
  chatMinimized = state;
  chatPanel.classList.toggle("minimized", chatMinimized);
  chatWidget.classList.toggle("minimized", chatMinimized);
  if (!chatMinimized) {
    chatInput.focus();
    scrollToBottom();
  }
}

chatMinimizeBtn.addEventListener("click", () => setMinimized(!chatMinimized));

// Clicking the header while minimized restores the panel
chatWidget.querySelector(".chat-header").addEventListener("click", (e) => {
  if (chatMinimized && !e.target.closest("button")) setMinimized(false);
});

// Clear conversation
chatClearBtn.addEventListener("click", () => {
  chatHistory = [];
  chatMessages.innerHTML = `
    <div class="chat-msg bot">
      <span class="msg-bubble">
        Conversation cleared. Ask me anything about plant health, diseases, or sustainability!
      </span>
    </div>`;
  chatSuggestions.hidden = false;
});

// Suggestion chips
chatSuggestions.addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  chatInput.value = chip.textContent;
  chatSuggestions.hidden = true;
  sendMessage();
});

// Send on Enter (Shift+Enter = newline)
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
chatSendBtn.addEventListener("click", sendMessage);

// Auto-grow textarea
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatBotText(text) {
  // Escape HTML, then convert **bold** to <b>bold</b>
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "$1");  // strip single asterisks (italics)
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  const bubble = document.createElement("span");
  bubble.className = "msg-bubble";
  if (role === "bot") {
    bubble.innerHTML = formatBotText(text);
  } else {
    bubble.textContent = text;
  }
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  scrollToBottom();
  return div;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "chat-msg bot";
  div.id = "typing-indicator";
  div.innerHTML = `
    <span class="msg-bubble typing-dots">
      <span></span><span></span><span></span>
    </span>`;
  chatMessages.appendChild(div);
  scrollToBottom();
}

function removeTyping() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

// Build plant context from current dashboard state
function buildPlantContext() {
  const plantId = $("plant-select")?.value;
  if (!plantId) return null;

  // Pull values from stat cards if populated
  const avgTemp  = parseFloat($("stat-temp")?.textContent);
  const avgLight = parseFloat($("stat-light")?.textContent);
  const avgDef   = parseFloat($("stat-def")?.textContent);

  const summary = {};
  if (!isNaN(avgTemp))  summary.avg_temp      = avgTemp;
  if (!isNaN(avgLight)) summary.avg_light     = avgLight;
  if (!isNaN(avgDef))   summary.avg_deformity = avgDef;

  return { plant_id: plantId, summary };
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatSuggestions.hidden = true;
  chatInput.value = "";
  chatInput.style.height = "auto";
  chatSendBtn.disabled = true;

  appendMessage("user", text);
  showTyping();

  // Show badge if panel is closed
  if (!chatOpen) {
    chatBadge.hidden = false;
  }

  try {
    const body = {
      message:       text,
      history:       chatHistory,
      plant_context: buildPlantContext(),
    };

    const res = await fetch(`${API_BASE}/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    const data = await res.json();
    removeTyping();

    if (data.error) {
      appendMessage("bot", `Sorry, something went wrong: ${data.error}`);
    } else {
      appendMessage("bot", data.reply);
      chatHistory = data.history;
    }
  } catch (e) {
    removeTyping();
    appendMessage("bot", "Could not reach the server. Please check your connection.");
  } finally {
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
}
