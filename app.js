const roleInput = document.querySelector('#roleInput');
const startButton = document.querySelector('#startButton');
const setupCard = document.querySelector('#setupCard');
const chatCard = document.querySelector('#chatCard');
const messagesEl = document.querySelector('#messages');
const replyForm = document.querySelector('#replyForm');
const replyInput = document.querySelector('#replyInput');
const toast = document.querySelector('#toast');
const micButton = document.querySelector('#micButton');
const languageSelect = document.querySelector('#languageSelect');
const history = [];
let speechRecognition = null;
let voiceReplies = false;
let activeRequest = null;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2900);
}

async function updateStatus() {
  const label = document.querySelector('#connectionLabel');
  const dot = document.querySelector('#localDot');
  try {
    const status = await (await fetch('/api/status')).json();
    label.textContent = status.available ? `${status.model} · on this computer` : status.connected ? `${status.model} · model not downloaded` : 'Local model not connected';
    dot.style.background = status.available ? '#5c8e5b' : '#c46d47';
  } catch { label.textContent = 'Local model not connected'; dot.style.background = '#c46d47'; }
}

function addMessage(role, content, speak = false) {
  const row = document.createElement('div');
  row.className = role === 'assistant' ? 'welcome-message' : 'answer-message';
  if (role === 'assistant') {
    const avatar = document.createElement('span'); avatar.className = 'mitra-avatar'; avatar.textContent = 'मि'; row.append(avatar);
  }
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  const author = document.createElement('div'); author.className = 'bubble-author'; author.textContent = role === 'assistant' ? 'Mitraha · your practice pal' : 'You · just now';
  const paragraph = document.createElement('p'); paragraph.textContent = content;
  bubble.append(author, paragraph);
  if (role === 'assistant' && speak) {
    const button = document.createElement('button'); button.className = 'speak-button'; button.textContent = '▶  Play it'; button.addEventListener('click', () => speakText(content)); bubble.append(button);
  }
  row.append(bubble); messagesEl.append(row); messagesEl.scrollTop = messagesEl.scrollHeight;
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return notify('Spoken playback is not available in this browser.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[\u0900-\u097F]/.test(text) ? 'hi-IN' : 'en-IN';
  speechSynthesis.speak(utterance);
}

document.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => speakText(button.dataset.speak)));
document.querySelector('#privacyButton').addEventListener('click', () => notify('Gemma replies run locally. Mic transcription may use your browser speech service; check its privacy settings.'));
document.querySelector('#historyButton').addEventListener('click', () => notify('This prototype keeps the session only in this tab.'));

micButton.addEventListener('click', async () => {
  if (speechRecognition) { speechRecognition.stop(); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return notify('Voice input is not supported in this browser. Try the latest Chrome or type your answer.');

  const recognition = new Recognition();
  voiceReplies = true;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  speechRecognition = recognition;
  recognition.lang = languageSelect.value;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  const originalText = replyInput.value.trim();
  let onDeviceAvailable = false;
  if ('processLocally' in recognition && typeof Recognition.available === 'function') {
    micButton.disabled = true;
    notify('Checking speech options for this language…');
    try {
      onDeviceAvailable = await Recognition.available({ langs: [recognition.lang], processLocally: true }) === 'available';
    } catch { onDeviceAvailable = false; }
    micButton.disabled = false;
    if (speechRecognition !== recognition) return;
    if (onDeviceAvailable) recognition.processLocally = true;
  }
  micButton.classList.add('listening');
  micButton.setAttribute('aria-label', 'Stop voice input');
  notify(onDeviceAvailable ? 'Voice practice on · listening on this device.' : 'Voice practice on · speech handling depends on your browser settings.');

  recognition.onresult = event => {
    const words = Array.from(event.results, result => result[0].transcript).join('').trim();
    replyInput.value = [originalText, words].filter(Boolean).join(' ');
    replyInput.focus();
  };
  recognition.onerror = event => {
    const message = event.error === 'not-allowed' ? 'Microphone access is blocked. Allow it in your browser settings to use voice.'
      : event.error === 'language-not-supported' ? 'On-device speech for this language is unavailable. Try another language or browser.'
      : event.error === 'service-not-allowed' ? 'Your browser has disabled its speech service. You can type your answer or check browser settings.'
      : event.error === 'network' ? 'The browser speech service needs a network connection. Try again online or type your answer.'
      : event.error === 'no-speech' ? 'I didn’t catch that. Tap the mic and try again.'
      : `Voice input stopped: ${event.error}. You can type your answer instead.`;
    notify(message);
  };
  recognition.onend = () => {
    speechRecognition = null;
    micButton.disabled = false;
    micButton.classList.remove('listening');
    micButton.setAttribute('aria-label', 'Speak your answer');
  };
  try { recognition.start(); }
  catch { speechRecognition = null; voiceReplies = false; micButton.classList.remove('listening'); notify('Could not start voice input. Check microphone permissions and try again.'); }
});

startButton.addEventListener('click', () => {
  if (!roleInput.value.trim()) { roleInput.focus(); return notify('Add a role or opportunity to shape your practice.'); }
  document.querySelector('#sessionTitle').textContent = roleInput.value.trim();
  setupCard.classList.add('hidden'); chatCard.classList.remove('hidden');
  if (history.length === 0) {
    const opening = `Tell me a little about yourself and what kind of work you enjoy as you prepare for ${roleInput.value.trim()}.`;
    history.push({ role: 'assistant', content: opening });
    addMessage('assistant', opening, true);
  }
  replyInput.focus();
});

document.querySelector('#newSessionButton').addEventListener('click', () => {
  activeRequest?.abort();
  activeRequest = null;
  speechRecognition?.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  voiceReplies = false;
  replyInput.disabled = false;
  micButton.disabled = false;
  const send = replyForm.querySelector('.send-button'); send.disabled = false; send.textContent = '↑';
  history.length = 0; messagesEl.replaceChildren();
  roleInput.value = '';
  chatCard.classList.add('hidden'); setupCard.classList.remove('hidden');
});

replyForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (activeRequest) return;
  const answer = replyInput.value.trim();
  if (!answer) return;
  addMessage('user', answer); history.push({ role: 'user', content: answer });
  replyInput.value = '';
  const send = replyForm.querySelector('.send-button'); send.disabled = true; send.textContent = '…';
  replyInput.disabled = true; micButton.disabled = true;
  const controller = new AbortController();
  activeRequest = controller;
  const waitId = `wait-${Date.now()}`;
  const wait = document.createElement('div'); wait.id = waitId; wait.className = 'welcome-message'; wait.innerHTML = '<span class="mitra-avatar">मि</span><div class="bubble"><div class="bubble-author">Mitraha</div><p>Cooking up a thoughtful reply…</p></div>'; messagesEl.append(wait); messagesEl.scrollTop = messagesEl.scrollHeight;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ messages: history.slice(-12), prompt: `You are Interview Mitraha (Interview मित्रः), a warm and practical job interview coach. The person is practising for: ${roleInput.value.trim()}. Ask one question at a time. When they answer, give concise feedback in their language (English, Hindi or Hinglish): name one specific strength, suggest one improvement, and offer a natural revised version that does not invent facts. Then ask the next relevant interview question. Be encouraging, never grade or score them, and do not claim to assess accent or pronunciation.` }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ollama did not accept the request.');
    const reply = data.message?.content || 'I’m here with you. Could you tell me a little more?';
    history.push({ role: 'assistant', content: reply });
    if (history.length > 12) history.splice(0, history.length - 12);
    document.getElementById(waitId)?.remove(); addMessage('assistant', reply, true);
    if (voiceReplies) speakText(reply);
  } catch (error) {
    document.getElementById(waitId)?.remove();
    if (error.name !== 'AbortError') notify(error.message || 'Could not get a reply from Gemma. Check that Ollama is running and the model is installed.');
  } finally {
    if (activeRequest === controller) {
      activeRequest = null;
      send.disabled = false; send.textContent = '↑';
      replyInput.disabled = false; micButton.disabled = false;
      replyInput.focus();
    }
  }
});

updateStatus();
