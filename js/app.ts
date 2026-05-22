const DIFFICULTY = 16;

interface DyschanClientConfig {
  API_BASE_URL?: string;
  JOIN_ENDPOINT?: string;
  THREAD_ENDPOINT?: string;
  POST_ENDPOINT?: string;
  BOARD_ENDPOINT?: string;
  GET_THREAD_ENDPOINT?: string;
  DEFAULT_BOARDS?: string;
}

const clientConfig = (window as typeof window & { DYSCHAN_CLIENT_CONFIG?: DyschanClientConfig }).DYSCHAN_CLIENT_CONFIG;
const {
  API_BASE_URL,
  JOIN_ENDPOINT,
  THREAD_ENDPOINT,
  POST_ENDPOINT,
  BOARD_ENDPOINT,
  GET_THREAD_ENDPOINT,
} = clientConfig ?? {};

const ENDPOINTS: DyschanClientConfig = {
  API_BASE_URL,
  JOIN_ENDPOINT,
  THREAD_ENDPOINT,
  POST_ENDPOINT,
  BOARD_ENDPOINT,
  GET_THREAD_ENDPOINT,
};

const REQUIRED_ENDPOINTS_BY_PAGE: Record<string, (keyof DyschanClientConfig)[]> = {
  index: ['API_BASE_URL', 'JOIN_ENDPOINT'],
  board: ['API_BASE_URL', 'THREAD_ENDPOINT', 'BOARD_ENDPOINT'],
  thread: ['API_BASE_URL', 'POST_ENDPOINT', 'GET_THREAD_ENDPOINT'],
};

// ---- Page Detection ----
const page = (document.body.dataset['page'] as string | undefined) ?? '';
const missingEndpointKeys = getMissingEndpointKeys(page);

if (missingEndpointKeys.length > 0) {
  renderConfigError(`Missing API configuration: ${missingEndpointKeys.join(', ')}`);
} else if (page === 'index') initIndex();
else if (page === 'board') initBoard();
else if (page === 'thread') initThread();

// ---- Index Page ----
async function initIndex(): Promise<void> {
  const form = document.getElementById('join-form') as HTMLFormElement | null;
  const input = document.getElementById('phrase-input') as HTMLInputElement | null;
  const statusEl = document.getElementById('status') as HTMLElement | null;
  const nameInput = document.getElementById('board-name-input') as HTMLInputElement | null;

  form?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const phrase = input?.value.trim() ?? '';
    if (!phrase) return;
    if (statusEl) statusEl.textContent = 'Joining board...';
    try {
      const res = await fetch(JOIN_ENDPOINT!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared_phrase: phrase, board_name: nameInput?.value.trim() || null }),
      });
      const data = await res.json() as { board_id?: string };
      if (data.board_id) {
        saveBoard(data.board_id, {
          phrase,
          name: nameInput?.value.trim() || undefined,
        });
        window.location.href = `board.html#/board/${encodeURIComponent(data.board_id)}`;
      } else {
        if (statusEl) statusEl.textContent = 'Error: ' + JSON.stringify(data);
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Network error: ' + (err as Error).message;
    }
  });

  renderDefaultBoards();
  renderSavedBoards();
}

function renderDefaultBoards(): void {
  const container = document.getElementById('default-boards');
  if (!container) return;
  const defaults = getDefaultBoards();
  if (defaults.length === 0) {
    container.innerHTML = '<p>No default boards configured.</p>';
    return;
  }
  container.innerHTML = defaults.map(renderBoardEntry).join('');
}

function renderSavedBoards(): void {
  const container = document.getElementById('saved-boards');
  if (!container) return;
  const saved = getSavedBoards();
  if (saved.length === 0) {
    container.innerHTML = '<p>No saved boards yet.</p>';
    return;
  }
  container.innerHTML = saved.map(renderBoardEntry).join('');
}

interface SavedBoard {
  id: string;
  name?: string;
  phrase?: string;
}

function getSavedBoards(): SavedBoard[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('dyschan_boards') ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((board): board is SavedBoard =>
        typeof board === 'object' &&
        board !== null &&
        typeof (board as SavedBoard).id === 'string'
      )
      .map(board => ({
        id: board.id,
        name: typeof board.name === 'string' ? board.name : undefined,
        phrase: typeof board.phrase === 'string' ? board.phrase : undefined,
      }));
  } catch {
    return [];
  }
}

function saveBoard(id: string, updates: Omit<SavedBoard, 'id'> = {}): void {
  const boards = getSavedBoards();
  const existing = boards.find(b => b.id === id);
  if (existing) {
    if (updates.name) existing.name = updates.name;
    if (updates.phrase) existing.phrase = updates.phrase;
  } else {
    boards.push({ id, ...updates });
  }
  localStorage.setItem('dyschan_boards', JSON.stringify(boards));
}

function renderBoardEntry(board: SavedBoard): string {
  const boardId = escapeHtml(board.id);
  const boardInfo = [
    board.phrase ? escapeHtml(board.phrase) : null,
    board.name ? escapeHtml(board.name) : null,
  ].filter(Boolean).join(' · ');

  const details = boardInfo || 'No details';

  return `<div class="board-entry">
    <a href="board.html#/board/${encodeURIComponent(board.id)}">${boardId}</a>
    <div class="board-entry-details">${details}</div>
  </div>`;
}

function getDefaultBoards(): SavedBoard[] {
  const defaultsFromConfig = typeof clientConfig?.DEFAULT_BOARDS === 'string'
    ? clientConfig.DEFAULT_BOARDS
    : '';
  const defaultsFromMeta = document
    .querySelector('meta[name="dyschan-default-boards"]')
    ?.getAttribute('content')
    ?.trim() ?? '';

  return parseBoardsConfig(defaultsFromConfig || defaultsFromMeta);
}

function parseBoardsConfig(configValue: string): SavedBoard[] {
  if (!configValue) return [];
  try {
    const parsed = JSON.parse(configValue) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(entry => {
        if (typeof entry === 'string') {
          return { id: entry };
        }
        if (typeof entry !== 'object' || entry === null) {
          return null;
        }
        const id = getStringProp(entry, 'id');
        if (!id) return null;
        const phrase = getStringProp(entry, 'phrase');
        const name = getStringProp(entry, 'name');
        return { id, phrase, name };
      })
      .filter((board): board is SavedBoard => Boolean(board));
  } catch {
    return [];
  }
}

function getStringProp(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === 'string' ? prop : undefined;
}

// ---- Board Page ----
async function initBoard(): Promise<void> {
  const boardId = getRouteContext().boardId;
  if (!boardId) {
    const el = document.getElementById('board-content');
    if (el) el.textContent = 'Missing board_id';
    return;
  }

  document.getElementById('new-thread-btn')?.addEventListener('click', () => {
    document.getElementById('new-thread-form')?.classList.toggle('hidden');
  });

  document.getElementById('thread-form')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    await submitThread(boardId);
  });

  await loadBoard(boardId);
}

interface BoardData {
  board?: { name?: string };
  error?: string;
}

interface ThreadSummary {
  thread_id: string;
  created?: number;
  post_count?: number;
  last_post?: number;
  style_seed?: string | null;
  body?: string;
}

async function loadBoard(boardId: string): Promise<void> {
  const container = document.getElementById('board-content');
  if (!container) return;
  container.innerHTML = '<p>Loading...</p>';
  try {
    const boardUrl = new URL(BOARD_ENDPOINT!);
    boardUrl.searchParams.set('board_id', boardId);
    const res = await fetch(boardUrl.href);
    const data = await res.json() as BoardData & { threads?: ThreadSummary[] };
    if (!res.ok) { container.textContent = `Error: ${data.error ?? 'unknown'}`; return; }
    saveBoard(boardId, { name: data.board?.name });
    renderThreadList(data.threads ?? [], boardId, container);
  } catch (err) {
    container.textContent = `Network error: ${(err as Error).message}`;
  }
}

function renderThreadList(threads: ThreadSummary[], boardId: string, container: HTMLElement): void {
  if (!threads.length) { container.innerHTML = '<p>No threads yet. Start one!</p>'; return; }
  const sBoardId = encodeURIComponent(boardId);
  container.innerHTML = threads.map(t => `
    <div class="thread-preview">
      ${renderPostMarkup({
        timestamp: t.created,
        style_seed: t.style_seed ?? undefined,
        body: t.body,
      })}
      <div class="thread-preview-footer">
        <a href="thread.html#/thread/${sBoardId}/${encodeURIComponent(t.thread_id)}">
          ${escapeHtml(formatReplyCount(t.post_count))}
        </a>
        <span class="meta">Thread ${escapeHtml(t.thread_id.slice(0,8))}... · last: ${escapeHtml(new Date((t.last_post ?? 0) * 1000).toLocaleString())}</span>
      </div>
    </div>
  `).join('');
}

async function submitThread(boardId: string): Promise<void> {
  const bodyEl = document.getElementById('thread-body') as HTMLTextAreaElement | null;
  const statusEl = document.getElementById('thread-status') as HTMLElement | null;
  const secretEl = document.getElementById('user-secret') as HTMLInputElement | null;
  const body = bodyEl?.value.trim() ?? '';
  if (!body) return;
  if (statusEl) statusEl.textContent = 'Computing PoW...';

  const timestamp = Math.floor(Date.now() / 1000);
  const bh = await bodyHash(body);
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2,'0')).join('');
  const pow = await solvePow({ timestamp, threadId: 'new', boardId, bodyHash: bh, salt, difficulty: DIFFICULTY });

  let styleSeedVal: string | null = null;
  if (secretEl?.value) {
    const trip = await hiddenTrip(secretEl.value, boardId);
    const tid = await computeThreadId(timestamp, bh);
    styleSeedVal = await styleSeed(trip, tid);
  }

  if (statusEl) statusEl.textContent = 'Posting...';
  try {
    const res = await fetch(THREAD_ENDPOINT!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: boardId, timestamp, body, body_hash: bh, pow, style_seed: styleSeedVal, client_meta: { version: '0.9.0' } }),
    });
    const data = await res.json() as { thread_id?: string };
    if (data.thread_id) {
      window.location.href = `thread.html#/thread/${encodeURIComponent(boardId)}/${encodeURIComponent(data.thread_id)}`;
    } else {
      if (statusEl) statusEl.textContent = 'Error: ' + JSON.stringify(data);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Network error: ' + (err as Error).message;
  }
}

// ---- Thread Page ----
async function initThread(): Promise<void> {
  const { boardId, threadId } = getRouteContext();
  if (!boardId || !threadId) {
    const el = document.getElementById('thread-content');
    if (el) el.textContent = 'Missing params';
    return;
  }

  document.getElementById('reply-form')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    await submitPost(boardId, threadId);
  });

  await loadThread(boardId, threadId);
}

interface PostData {
  timestamp?: number;
  style_seed?: string;
  body?: string;
}

async function loadThread(boardId: string, threadId: string): Promise<void> {
  const container = document.getElementById('thread-content');
  if (!container) return;
  container.innerHTML = '<p>Loading...</p>';
  try {
    const threadUrl = new URL(GET_THREAD_ENDPOINT!);
    threadUrl.searchParams.set('board_id', boardId);
    threadUrl.searchParams.set('thread_id', threadId);
    const res = await fetch(threadUrl.href);
    const data = await res.json() as { posts?: PostData[]; error?: string };
    if (!res.ok) { container.textContent = `Error: ${data.error ?? 'unknown'}`; return; }
    renderPosts(data.posts ?? [], container);
  } catch (err) {
    container.textContent = `Network error: ${(err as Error).message}`;
  }
}

function renderPosts(posts: PostData[], container: HTMLElement): void {
  if (!posts.length) { container.innerHTML = '<p>No posts.</p>'; return; }
  container.innerHTML = posts.map(renderPostMarkup).join('');
}

function renderPostMarkup(data: PostData): string {
  const style = data.style_seed ? deriveStyle(data.style_seed) : null;
  const avatarHtml = style ? style.avatar : '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="#555"/></svg>';
  const headerColor = style ? style.headerColour : '#555555';
  return `
    <div class="post" style="border-left: 4px solid ${headerColor}">
      <div class="post-header">
        <span class="avatar">${avatarHtml}</span>
        <span class="post-meta">${new Date((data.timestamp ?? 0) * 1000).toLocaleString()}</span>
      </div>
      <div class="post-body">${escapeHtml(data.body ?? '')}</div>
    </div>
  `;
}

function formatReplyCount(postCount?: number): string {
  const replies = Math.max(0, (postCount ?? 1) - 1);
  return `${replies} ${replies === 1 ? 'reply' : 'replies'}`;
}

async function submitPost(boardId: string, threadId: string): Promise<void> {
  const bodyEl = document.getElementById('reply-body') as HTMLTextAreaElement | null;
  const statusEl = document.getElementById('reply-status') as HTMLElement | null;
  const secretEl = document.getElementById('user-secret') as HTMLInputElement | null;
  const body = bodyEl?.value.trim() ?? '';
  if (!body) return;
  if (statusEl) statusEl.textContent = 'Computing PoW...';

  const timestamp = Math.floor(Date.now() / 1000);
  const bh = await bodyHash(body);
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2,'0')).join('');
  const pow = await solvePow({ timestamp, threadId, boardId, bodyHash: bh, salt, difficulty: DIFFICULTY });

  let styleSeedVal: string | null = null;
  if (secretEl?.value) {
    const trip = await hiddenTrip(secretEl.value, boardId);
    styleSeedVal = await styleSeed(trip, threadId);
  }

  if (statusEl) statusEl.textContent = 'Posting...';
  try {
    const res = await fetch(POST_ENDPOINT!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId, board_id: boardId, timestamp, body, body_hash: bh, pow, style_seed: styleSeedVal, client_meta: { version: '0.9.0' } }),
    });
    const data = await res.json() as { post_id?: string };
    if (data.post_id) {
      if (bodyEl) bodyEl.value = '';
      if (statusEl) statusEl.textContent = 'Posted!';
      await loadThread(boardId, threadId);
    } else {
      if (statusEl) statusEl.textContent = 'Error: ' + JSON.stringify(data);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Network error: ' + (err as Error).message;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

interface RouteContext {
  boardId: string | null;
  threadId: string | null;
}

function getRouteContext(): RouteContext {
  const queryParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash ?? '';
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const hashPath = normalizedHash.startsWith('/') ? normalizedHash : null;
  const hashParams = new URLSearchParams(
    hashPath ? '' : normalizedHash.replace(/^\?/, '')
  );

  let boardId: string | null = queryParams.get('board_id');
  let threadId: string | null = queryParams.get('thread_id');

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

function getMissingEndpointKeys(currentPage: string): string[] {
  const requiredKeys: (keyof DyschanClientConfig)[] = REQUIRED_ENDPOINTS_BY_PAGE[currentPage] ?? [];
  return requiredKeys.filter(key => !ENDPOINTS[key]);
}

function renderConfigError(message: string): void {
  const target =
    document.getElementById('status') ??
    document.getElementById('board-content') ??
    document.getElementById('thread-content');
  if (target) {
    target.textContent = message;
  }
}
