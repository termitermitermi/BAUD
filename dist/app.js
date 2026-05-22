"use strict";
const DIFFICULTY = 16;
const clientConfig = window.DYSCHAN_CLIENT_CONFIG;
const { API_BASE_URL, JOIN_ENDPOINT, THREAD_ENDPOINT, POST_ENDPOINT, BOARD_ENDPOINT, GET_THREAD_ENDPOINT, } = clientConfig ?? {};
const ENDPOINTS = {
    API_BASE_URL,
    JOIN_ENDPOINT,
    THREAD_ENDPOINT,
    POST_ENDPOINT,
    BOARD_ENDPOINT,
    GET_THREAD_ENDPOINT,
};
const REQUIRED_ENDPOINTS_BY_PAGE = {
    index: ['API_BASE_URL', 'JOIN_ENDPOINT'],
    board: ['API_BASE_URL', 'THREAD_ENDPOINT', 'BOARD_ENDPOINT'],
    thread: ['API_BASE_URL', 'POST_ENDPOINT', 'GET_THREAD_ENDPOINT'],
};
// ---- Page Detection ----
const page = document.body.dataset['page'] ?? '';
const missingEndpointKeys = getMissingEndpointKeys(page);
if (missingEndpointKeys.length > 0) {
    renderConfigError(`Missing API configuration: ${missingEndpointKeys.join(', ')}`);
}
else if (page === 'index')
    initIndex();
else if (page === 'board')
    initBoard();
else if (page === 'thread')
    initThread();
// ---- Index Page ----
async function initIndex() {
    const form = document.getElementById('join-form');
    const input = document.getElementById('phrase-input');
    const statusEl = document.getElementById('status');
    const nameInput = document.getElementById('board-name-input');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phrase = input?.value.trim() ?? '';
        if (!phrase)
            return;
        if (statusEl)
            statusEl.textContent = 'Joining board...';
        try {
            const res = await fetch(JOIN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shared_phrase: phrase, board_name: nameInput?.value.trim() || null }),
            });
            const data = await res.json();
            if (data.board_id) {
                window.location.href = `board.html#/board/${encodeURIComponent(data.board_id)}`;
            }
            else {
                if (statusEl)
                    statusEl.textContent = 'Error: ' + JSON.stringify(data);
            }
        }
        catch (err) {
            if (statusEl)
                statusEl.textContent = 'Network error: ' + err.message;
        }
    });
    renderSavedBoards();
}
function renderSavedBoards() {
    const container = document.getElementById('saved-boards');
    if (!container)
        return;
    const saved = getSavedBoards();
    if (saved.length === 0) {
        container.innerHTML = '<p>No saved boards yet.</p>';
        return;
    }
    container.innerHTML = saved.map(b => `<div class="board-entry"><a href="board.html#/board/${encodeURIComponent(b.id)}">${escapeHtml(b.name || b.id.slice(0, 8) + '...')}</a></div>`).join('');
}
function getSavedBoards() {
    try {
        return JSON.parse(localStorage.getItem('dyschan_boards') ?? '[]');
    }
    catch {
        return [];
    }
}
function saveBoard(id, name) {
    const boards = getSavedBoards();
    if (!boards.find(b => b.id === id)) {
        boards.push({ id, name });
        localStorage.setItem('dyschan_boards', JSON.stringify(boards));
    }
}
// ---- Board Page ----
async function initBoard() {
    const boardId = getRouteContext().boardId;
    if (!boardId) {
        const el = document.getElementById('board-content');
        if (el)
            el.textContent = 'Missing board_id';
        return;
    }
    document.getElementById('new-thread-btn')?.addEventListener('click', () => {
        document.getElementById('new-thread-form')?.classList.toggle('hidden');
    });
    document.getElementById('thread-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitThread(boardId);
    });
    await loadBoard(boardId);
}
async function loadBoard(boardId) {
    const container = document.getElementById('board-content');
    if (!container)
        return;
    container.innerHTML = '<p>Loading...</p>';
    try {
        const boardUrl = new URL(BOARD_ENDPOINT);
        boardUrl.searchParams.set('board_id', boardId);
        const res = await fetch(boardUrl.href);
        const data = await res.json();
        if (!res.ok) {
            container.textContent = `Error: ${data.error ?? 'unknown'}`;
            return;
        }
        saveBoard(boardId, data.board?.name);
        renderThreadList(data.threads ?? [], boardId, container);
    }
    catch (err) {
        container.textContent = `Network error: ${err.message}`;
    }
}
function renderThreadList(threads, boardId, container) {
    if (!threads.length) {
        container.innerHTML = '<p>No threads yet. Start one!</p>';
        return;
    }
    const sBoardId = encodeURIComponent(boardId);
    container.innerHTML = threads.map(t => `
    <div class="thread-preview">
      <a href="thread.html#/thread/${sBoardId}/${encodeURIComponent(t.thread_id)}">
        Thread ${escapeHtml(t.thread_id.slice(0, 8))}...
      </a>
      <span class="meta">${escapeHtml(String(t.post_count ?? 0))} posts · last: ${escapeHtml(new Date((t.last_post ?? 0) * 1000).toLocaleString())}</span>
    </div>
  `).join('');
}
async function submitThread(boardId) {
    const bodyEl = document.getElementById('thread-body');
    const statusEl = document.getElementById('thread-status');
    const secretEl = document.getElementById('user-secret');
    const body = bodyEl?.value.trim() ?? '';
    if (!body)
        return;
    if (statusEl)
        statusEl.textContent = 'Computing PoW...';
    const timestamp = Math.floor(Date.now() / 1000);
    const bh = await bodyHash(body);
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
    const pow = await solvePow({ timestamp, threadId: 'new', boardId, bodyHash: bh, salt, difficulty: DIFFICULTY });
    let styleSeedVal = null;
    if (secretEl?.value) {
        const trip = await hiddenTrip(secretEl.value, boardId);
        const tid = await computeThreadId(timestamp, bh);
        styleSeedVal = await styleSeed(trip, tid);
    }
    if (statusEl)
        statusEl.textContent = 'Posting...';
    try {
        const res = await fetch(THREAD_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board_id: boardId, timestamp, body, body_hash: bh, pow, style_seed: styleSeedVal, client_meta: { version: '0.9.0' } }),
        });
        const data = await res.json();
        if (data.thread_id) {
            window.location.href = `thread.html#/thread/${encodeURIComponent(boardId)}/${encodeURIComponent(data.thread_id)}`;
        }
        else {
            if (statusEl)
                statusEl.textContent = 'Error: ' + JSON.stringify(data);
        }
    }
    catch (err) {
        if (statusEl)
            statusEl.textContent = 'Network error: ' + err.message;
    }
}
// ---- Thread Page ----
async function initThread() {
    const { boardId, threadId } = getRouteContext();
    if (!boardId || !threadId) {
        const el = document.getElementById('thread-content');
        if (el)
            el.textContent = 'Missing params';
        return;
    }
    document.getElementById('reply-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitPost(boardId, threadId);
    });
    await loadThread(boardId, threadId);
}
async function loadThread(boardId, threadId) {
    const container = document.getElementById('thread-content');
    if (!container)
        return;
    container.innerHTML = '<p>Loading...</p>';
    try {
        const threadUrl = new URL(GET_THREAD_ENDPOINT);
        threadUrl.searchParams.set('board_id', boardId);
        threadUrl.searchParams.set('thread_id', threadId);
        const res = await fetch(threadUrl.href);
        const data = await res.json();
        if (!res.ok) {
            container.textContent = `Error: ${data.error ?? 'unknown'}`;
            return;
        }
        renderPosts(data.posts ?? [], container);
    }
    catch (err) {
        container.textContent = `Network error: ${err.message}`;
    }
}
function renderPosts(posts, container) {
    if (!posts.length) {
        container.innerHTML = '<p>No posts.</p>';
        return;
    }
    container.innerHTML = posts.map(p => {
        const style = p.style_seed ? deriveStyle(p.style_seed) : null;
        const avatarHtml = style ? style.avatar : '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="#555"/></svg>';
        const headerColor = style ? style.headerColour : '#555555';
        return `
      <div class="post" style="border-left: 4px solid ${headerColor}">
        <div class="post-header">
          <span class="avatar">${avatarHtml}</span>
          <span class="post-meta">${new Date((p.timestamp ?? 0) * 1000).toLocaleString()}</span>
        </div>
        <div class="post-body">${escapeHtml(p.body ?? '')}</div>
      </div>
    `;
    }).join('');
}
async function submitPost(boardId, threadId) {
    const bodyEl = document.getElementById('reply-body');
    const statusEl = document.getElementById('reply-status');
    const secretEl = document.getElementById('user-secret');
    const body = bodyEl?.value.trim() ?? '';
    if (!body)
        return;
    if (statusEl)
        statusEl.textContent = 'Computing PoW...';
    const timestamp = Math.floor(Date.now() / 1000);
    const bh = await bodyHash(body);
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
    const pow = await solvePow({ timestamp, threadId, boardId, bodyHash: bh, salt, difficulty: DIFFICULTY });
    let styleSeedVal = null;
    if (secretEl?.value) {
        const trip = await hiddenTrip(secretEl.value, boardId);
        styleSeedVal = await styleSeed(trip, threadId);
    }
    if (statusEl)
        statusEl.textContent = 'Posting...';
    try {
        const res = await fetch(POST_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thread_id: threadId, board_id: boardId, timestamp, body, body_hash: bh, pow, style_seed: styleSeedVal, client_meta: { version: '0.9.0' } }),
        });
        const data = await res.json();
        if (data.post_id) {
            if (bodyEl)
                bodyEl.value = '';
            if (statusEl)
                statusEl.textContent = 'Posted!';
            await loadThread(boardId, threadId);
        }
        else {
            if (statusEl)
                statusEl.textContent = 'Error: ' + JSON.stringify(data);
        }
    }
    catch (err) {
        if (statusEl)
            statusEl.textContent = 'Network error: ' + err.message;
    }
}
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getRouteContext() {
    const queryParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash ?? '';
    const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
    const hashPath = normalizedHash.startsWith('/') ? normalizedHash : null;
    const hashParams = new URLSearchParams(hashPath ? '' : normalizedHash.replace(/^\?/, ''));
    let boardId = queryParams.get('board_id');
    let threadId = queryParams.get('thread_id');
    if (hashParams.has('board_id')) {
        boardId = hashParams.get('board_id');
    }
    if (hashParams.has('thread_id')) {
        threadId = hashParams.get('thread_id');
    }
    if (hashPath) {
        const boardMatch = hashPath.match(/^\/board\/([^/]+)$/);
        if (boardMatch) {
            boardId = decodeURIComponent(boardMatch[1]);
        }
        const threadMatch = hashPath.match(/^\/thread\/([^/]+)\/([^/]+)$/);
        if (threadMatch) {
            boardId = decodeURIComponent(threadMatch[1]);
            threadId = decodeURIComponent(threadMatch[2]);
        }
    }
    return { boardId, threadId };
}
function getMissingEndpointKeys(currentPage) {
    const requiredKeys = REQUIRED_ENDPOINTS_BY_PAGE[currentPage] ?? [];
    return requiredKeys.filter(key => !ENDPOINTS[key]);
}
function renderConfigError(message) {
    const target = document.getElementById('status') ??
        document.getElementById('board-content') ??
        document.getElementById('thread-content');
    if (target) {
        target.textContent = message;
    }
}
//# sourceMappingURL=app.js.map