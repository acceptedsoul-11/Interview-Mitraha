'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MODEL = 'gemma3:4b';
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const MAX_BODY_BYTES = 48 * 1024;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_PROMPT_CHARS = 4_000;
const REQUEST_TIMEOUT_MS = 120_000;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
};

const DEFAULT_SYSTEM_PROMPT = 'You are Interview Mitraha (Interview मित्रः), a kind and practical job interview practice partner. Be encouraging but specific. Never invent credentials or achievements for the user. Ask one question at a time. Give concise feedback with one strength, one improvement, and one suggested revision. Support English, Hindi, and Hinglish; follow the language the user uses.';

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': CONTENT_TYPES['.json'] });
  res.end(JSON.stringify(body));
}

function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        tooLarge = true;
        body = '';
      }
    });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function validateChatPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Request body must be a JSON object.' };
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > MAX_MESSAGES) {
    return { error: `messages must contain between 1 and ${MAX_MESSAGES} turns.` };
  }
  const messages = [];
  for (const message of payload.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      return { error: 'Each message must have a user or assistant role and text content.' };
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) {
      return { error: `Message content must be between 1 and ${MAX_MESSAGE_CHARS} characters.` };
    }
    messages.push({ role: message.role, content });
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { error: 'The newest message must be from the user.' };
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (prompt.length > MAX_PROMPT_CHARS) return { error: `prompt must be ${MAX_PROMPT_CHARS} characters or fewer.` };
  return { value: { messages, prompt } };
}

function isPathInside(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function createServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || __dirname);
  const model = options.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const ollamaUrl = (options.ollamaUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;

  return http.createServer(async (req, res) => {
    applySecurityHeaders(res);
    let requestUrl;
    try { requestUrl = new URL(req.url, 'http://127.0.0.1'); }
    catch { return sendJson(res, 400, { error: 'Invalid request URL.' }); }

    if (req.method === 'GET' && requestUrl.pathname === '/api/status') {
      try {
        const response = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) return sendJson(res, 200, { connected: false, model, available: false, models: [] });
        const data = await response.json();
        const models = Array.isArray(data.models) ? data.models.map(item => item?.name).filter(name => typeof name === 'string') : [];
        return sendJson(res, 200, { connected: true, model, available: models.includes(model), models });
      } catch {
        return sendJson(res, 200, { connected: false, model, available: false, models: [] });
      }
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/chat') {
      let payload;
      try { payload = await readJson(req); }
      catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message || 'Unable to read request body.' }); }

      const validated = validateChatPayload(payload);
      if (validated.error) return sendJson(res, 400, { error: validated.error });

      try {
        const response = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: validated.value.prompt || DEFAULT_SYSTEM_PROMPT },
              ...validated.value.messages
            ]
          })
        });
        const result = await response.json();
        return sendJson(res, response.ok ? 200 : 502, response.ok ? result : { error: result.error || 'The local model could not complete this reply.' });
      } catch (error) {
        const message = error.name === 'TimeoutError'
          ? 'The local model took too long to reply. Try again or use a smaller model.'
          : 'Could not reach Ollama. Make sure it is running and the selected model is installed.';
        return sendJson(res, 502, { error: message });
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });

    let pathname;
    try { pathname = decodeURIComponent(requestUrl.pathname); }
    catch { return sendJson(res, 400, { error: 'Invalid path encoding.' }); }
    const requestedFile = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(rootDir, requestedFile);
    if (!isPathInside(rootDir, filePath)) return sendJson(res, 403, { error: 'Path is outside the application directory.' });

    fs.readFile(filePath, (error, content) => {
      if (error) {
        const status = error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500;
        return sendJson(res, status, { error: status === 404 ? 'Not found.' : 'Unable to read this file.' });
      }
      res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream' });
      if (req.method === 'HEAD') return res.end();
      res.end(content);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, '127.0.0.1', () => console.log(`Interview मित्रः is ready at http://127.0.0.1:${port}`));
}

module.exports = { createServer, validateChatPayload, MAX_BODY_BYTES, MAX_MESSAGES };
