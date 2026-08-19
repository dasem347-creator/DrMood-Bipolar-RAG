// ضبطي العنوان ده لو الباك إند شغال على بورت أو دومين مختلف
const API_BASE = "http://localhost:8001";

let conversationId = null;
let currentRole = "patient";

// ---------- Navigation ----------
const chatNav = document.querySelector('[data-view="chat"]');
chatNav.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
  chatNav.classList.add("active");
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active-view"));
  document.getElementById("chatView").classList.add("active-view");
});

// ---------- Patient / Doctor mode ----------
const roleButtons = document.querySelectorAll(".role-btn");

roleButtons.forEach(button => {
  button.addEventListener("click", () => {
    roleButtons.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    currentRole = button.dataset.role; // "patient" | "doctor" - يطابق الـ schema بالظبط
    const input = document.getElementById("questionInput");

    input.placeholder = currentRole === "doctor"
      ? "Ask a clinical question about bipolar disorder..."
      : "Ask a question about bipolar disorder...";
  });
});

// ---------- Evidence drawer ----------
const evidenceDrawer = document.getElementById("evidenceDrawer");
const evidenceToggle = document.getElementById("evidenceToggle");
const closeEvidence = document.getElementById("closeEvidence");
const openEvidenceInline = document.getElementById("openEvidenceInline");
const drawerBody = evidenceDrawer.querySelector(".drawer-body");

function openEvidence() {
  evidenceDrawer.classList.add("open");
}
function hideEvidence() {
  evidenceDrawer.classList.remove("open");
}

evidenceToggle.addEventListener("click", openEvidence);
closeEvidence.addEventListener("click", hideEvidence);
openEvidenceInline.addEventListener("click", openEvidence);

// بيرسم الـ evidence الحقيقية الراجعة من الـ API جوه الـ drawer
function renderEvidence(evidenceList) {
  if (!evidenceList || evidenceList.length === 0) {
    drawerBody.innerHTML = `<p style="padding:16px;">No supporting evidence for this answer.</p>`;
    return;
  }

  const cardsHtml = evidenceList.map((e, i) => `
    <div class="evidence-card ${i === 0 ? "selected" : ""}">
      <div class="evidence-top">
        <span class="score">${e.score.toFixed(2)}</span>
        <span class="${e.used ? "used" : "supporting"}">
          ${e.used ? '<i class="fa-solid fa-check"></i> Used' : "Supporting"}
        </span>
      </div>
      <h4>${e.source_title}</h4>
      <span class="evidence-meta">${e.source_meta}</span>
      <p>${e.snippet}</p>
    </div>
  `).join("");

  const top = evidenceList[0];
  const previewHtml = `
    <div class="source-preview">
      <div class="preview-title">
        <span>Source preview</span>
        <span>${top.source_meta}</span>
      </div>
      <div class="document">
        <strong>${top.source_title}</strong>
        <p class="highlight">${top.full_text}</p>
      </div>
    </div>
  `;

  drawerBody.innerHTML = cardsHtml + previewHtml;
}

// ---------- Chat ----------
const askBtn = document.getElementById("askBtn");
const input = document.getElementById("questionInput");
const messages = document.getElementById("chatMessages");

function addMessage(text, type, evidence = []) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${type}-message`;

  if (type === "assistant") {
    wrapper.innerHTML = `
      <div class="message-avatar">
        <img src="assets/logo.jpg" alt="Dr. Mood">
      </div>
      <div class="message-content">
        <span class="message-name">Clinical Assist</span>
        <div class="bubble">
          ${text}
          <div class="answer-source">
            <i class="fa-solid fa-book-medical"></i>
            Based on approved clinical resources
            <button class="dynamic-evidence">View evidence</button>
          </div>
        </div>
      </div>
    `;

    wrapper.querySelector(".dynamic-evidence").addEventListener("click", () => {
      renderEvidence(evidence);
      openEvidence();
    });
  } else {
    wrapper.innerHTML = `
      <div class="message-content">
        <span class="message-name">You</span>
        <div class="bubble">${text}</div>
      </div>
    `;
  }

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function addLoadingMessage() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant-message";
  wrapper.id = "loadingMessage";
  wrapper.innerHTML = `
    <div class="message-avatar">
      <img src="assets/logo.jpg" alt="Dr. Mood">
    </div>
    <div class="message-content">
      <span class="message-name">DrMood</span>
      <div class="bubble">Thinking...</div>
    </div>
  `;
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function removeLoadingMessage() {
  const el = document.getElementById("loadingMessage");
  if (el) el.remove();
}

async function sendQuestion() {
  const question = input.value.trim();
  if (!question) return;

  addMessage(question, "user");
  input.value = "";
  addLoadingMessage();

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        role: currentRole,
        message: question,
      }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();
    conversationId = data.conversation_id;

    // استخراج محتوى النص بشكل آمن
    let messageText = "";
    if (typeof data.message === "object" && data.message !== null) {
      messageText = data.message.content || "";
    } else {
      messageText = data.message || "";
    }

    const evidence = data.message.evidence || [];

    // إزالة رسالة الـ Thinking أولاً قبل إضافة الإجابة النهائية
    removeLoadingMessage();

    // تجهيز النص مع مؤشر الثقة واللون
    let messageContent = messageText;
    if (data.confidence) {
      const badgeColor = data.confidence_color === 'green' ? '#2e7d32' : data.confidence_color === 'orange' ? '#ef6c00' : '#c62828';
      messageContent += `<div style="margin-top: 8px; font-size: 12px; font-weight: bold; color: ${badgeColor};">مستوى الثقة: ${data.confidence}</div>`;
    }

    addMessage(messageContent, "assistant", evidence);

  } catch (err) {
    console.error("Chat request failed:", err);
    removeLoadingMessage();
    addMessage("Sorry, I couldn't reach the server. Please make sure the backend is running.", "assistant");
  }
}

askBtn.addEventListener("click", sendQuestion);

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendQuestion();
  }
});

document.querySelectorAll(".quick-question").forEach(button => {
  button.addEventListener("click", () => {
    input.value = button.textContent;
    sendQuestion();
  });
});

// ---------- History submenu ----------
const historyToggle = document.getElementById("historyToggle");
const historySubmenu = document.getElementById("historySubmenu");

historyToggle.addEventListener("click", () => {
  const isOpen = historySubmenu.classList.toggle("open");
  historyToggle.classList.toggle("expanded", isOpen);
});