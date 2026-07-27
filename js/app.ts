const DIFFICULTY = 16;

interface DyschanClientConfig {
  API_BASE_URL?: string;
  JOIN_ENDPOINT?: string;
  THREAD_ENDPOINT?: string;
  POST_ENDPOINT?: string;
  BOARD_ENDPOINT?: string;
  GET_THREAD_ENDPOINT?: string;
  FLAG_ENDPOINT?: string;
  BOARDS_ENDPOINT?: string;
  DEFAULT_BOARDS?: string;
}

interface VersionInfo {
  ui_version?: string;
  ui_commit?: string;
  worker_version?: string;
}

const SITE_NAME = 'DYSCHAN';

const clientConfig = (window as typeof window & { DYSCHAN_CLIENT_CONFIG?: DyschanClientConfig }).DYSCHAN_CLIENT_CONFIG;
const {
  API_BASE_URL,
  JOIN_ENDPOINT,
  THREAD_ENDPOINT,
  POST_ENDPOINT,
  BOARD_ENDPOINT,
  GET_THREAD_ENDPOINT,
  FLAG_ENDPOINT,
  BOARDS_ENDPOINT,
} = clientConfig ?? {};

const ENDPOINTS: DyschanClientConfig = {
  API_BASE_URL,
  JOIN_ENDPOINT,
  THREAD_ENDPOINT,
  POST_ENDPOINT,
  BOARD_ENDPOINT,
  GET_THREAD_ENDPOINT,
  FLAG_ENDPOINT,
  BOARDS_ENDPOINT,
};

function getVersionEndpoint(apiBaseUrl?: string): string | null {
  if (!apiBaseUrl) return null;
  return new URL('version', `${apiBaseUrl}/`).href;
}

async function initVersionFooter(): Promise<void> {
  const footer = document.getElementById('version-footer');
  if (!footer) return;

  const versionEndpoint = getVersionEndpoint(API_BASE_URL);
  if (!versionEndpoint) {
    footer.innerHTML = 'Version info unavailable';
    return;
  }

  footer.textContent = 'Loading version info...';
  try {
    const res = await fetch(versionEndpoint, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as VersionInfo;
    const uiVersion = data.ui_version || 'unknown';
    const uiCommit = data.ui_commit || 'unknown';
    const workerVersion = data.worker_version || 'unknown';
    footer.innerHTML = `${escapeHtml(SITE_NAME)} UI <span>v${escapeHtml(uiVersion)}</span> · commit <code>${escapeHtml(uiCommit)}</code> · worker <code>${escapeHtml(workerVersion)}</code>`;
  } catch {
    footer.innerHTML = 'Version info unavailable';
  }
}

const REQUIRED_ENDPOINTS_BY_PAGE: Record<string, string[]> = {
  index: ['API_BASE_URL', 'JOIN_ENDPOINT'],
  board: ['API_BASE_URL', 'THREAD_ENDPOINT', 'BOARD_ENDPOINT'],
  thread: ['API_BASE_URL', 'POST_ENDPOINT', 'GET_THREAD_ENDPOINT', 'FLAG_ENDPOINT'],
};

// ---- Page Detection ----
const page = (document.body.dataset['page'] as string | undefined) ?? '';
void initVersionFooter().catch(error => {
  console.error('version_footer_error', error);
});
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
  loadPublicBoards();
}

async function loadPublicBoards(): Promise<void> {
  const container = document.getElementById('public-boards');
  if (!container) return;
  if (!BOARDS_ENDPOINT) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = 'Loading...';
  try {
    const res = await fetch(BOARDS_ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!res.ok) { container.innerHTML = ''; return; }
    const data = await res.json() as { boards?: Array<{ board_id: string; name?: string | null; locked?: boolean; thread_count?: number }> };
    const boards = data.boards ?? [];
    if (boards.length === 0) { container.innerHTML = '<p class="empty-state">No public boards available.</p>'; return; }
    container.innerHTML = boards.map(b => {
      const bid = encodeURIComponent(b.board_id);
      return `<div class="board-entry">
        <a href="board.html#/board/${bid}">
          <div class="board-entry-name">${escapeHtml(b.name ?? '(unnamed)')}</div>
          <div class="board-entry-details">ID: ${escapeHtml(b.board_id.slice(0, 12))}… · ${b.thread_count ?? 0} threads${b.locked ? ' · 🔒' : ''}</div>
        </a>
      </div>`;
    }).join('');
  } catch {
    container.innerHTML = '';
  }
}

function renderDefaultBoards(): void {
  const container = document.getElementById('default-boards');
  const section = document.getElementById('boards-section');
  if (!container) return;
  const defaults = getDefaultBoards();
  if (defaults.length === 0) {
    section?.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  section?.classList.remove('hidden');
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
  ].filter(Boolean).join(' \u00b7 ');

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

interface BoardMeta {
  board_id?: string;
  name?: string | null;
  identity_mode?: 'anonymous_only' | 'chanid_optional' | 'chanid_required' | 'verified_only';
  allow_nullpost?: boolean;
  nullpost_policy?: 'any' | 'chanid_only' | 'verified_only' | 'moderator_only';
  thread_count?: number;
  last_update?: number;
  [key: string]: unknown;
}

let currentBoardMeta: BoardMeta | null = null;

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
    currentBoardMeta = (data.board ?? {}) as BoardMeta;
    saveBoard(boardId, { name: currentBoardMeta.name ?? undefined });
    renderBoardInfo(currentBoardMeta);
    renderThreadList(data.threads ?? [], boardId, container);
    adaptToBoardConfig(currentBoardMeta);
    restoreChanid(boardId);
    setupChanidAutoSave(boardId);
  } catch (err) {
    container.textContent = `Network error: ${(err as Error).message}`;
  }
}

function renderBoardInfo(meta: BoardMeta): void {
  const el = document.getElementById('board-info');
  if (!el) return;
  const name = meta.name || 'Unnamed Board';
  const mode = meta.identity_mode ?? 'chanid_optional';

  const identityLabels: Record<string, string> = {
    anonymous_only: 'Anonymous Only',
    chanid_optional: 'Chan ID Optional',
    chanid_required: 'Chan ID Required',
    verified_only: 'Verified Only',
  };
  const identityLabel = identityLabels[mode] ?? 'Unknown';

  const identityTooltips: Record<string, string> = {
    anonymous_only: 'No identity required \u2014 all posts are fully anonymous',
    chanid_optional: 'You may optionally provide a Chan ID to establish an identity',
    chanid_required: 'A Chan ID is required to post',
    verified_only: 'Only verified identities may post',
  };

  const badgeColourClass = mode === 'verified_only' ? 'board-info-badge--verified'
    : mode === 'anonymous_only' ? 'board-info-badge--anonymous'
    : mode === 'chanid_required' ? 'board-info-badge--required'
    : '';

  const quietLabel = meta.allow_nullpost ? 'Quiet posts allowed' : 'Quiet posts disabled';
  const quietTooltip = meta.allow_nullpost
    ? 'Quiet posts do not bump the thread to the top of the board'
    : 'Quiet posting is not permitted on this board';

  let html = `
    <span class="board-info-name">${escapeHtml(name)}</span>
    <span class="board-info-badge ${escapeHtml(badgeColourClass)}">
      ${escapeHtml(identityLabel)}
      <span class="badge-tip" title="${escapeHtml(identityTooltips[mode] ?? '')}">?</span>
    </span>
    <span class="board-info-badge">
      ${escapeHtml(quietLabel)}
      <span class="badge-tip" title="${escapeHtml(quietTooltip)}">?</span>
    </span>`;

  if (typeof meta.thread_count === 'number') {
    html += `\n    <span class="board-info-badge">${meta.thread_count} ${meta.thread_count === 1 ? 'thread' : 'threads'}</span>`;
  }

  el.innerHTML = html;
  el.classList.remove('hidden');
}

function adaptToBoardConfig(meta: BoardMeta): void {
  const chanidField = document.getElementById('chanid-field');
  const quietField = document.getElementById('quiet-field');
  if (!chanidField || !quietField) return;

  const mode = meta.identity_mode ?? 'chanid_optional';
  const chanidInput = document.getElementById('chanid') as HTMLInputElement | null;

  if (mode === 'anonymous_only') {
    chanidField.classList.add('hidden');
    quietField.classList.add('hidden');
  } else {
    const isRequired = mode === 'chanid_required' || mode === 'verified_only';
    if (isRequired) {
      chanidField.classList.remove('hidden');
      if (chanidInput) chanidInput.placeholder = 'Chan ID (required)';
    } else {
      chanidField.classList.remove('hidden');
      if (chanidInput) chanidInput.placeholder = 'Chan ID (optional, for identity)';
    }
  }

  if (meta.allow_nullpost === true) {
    quietField.classList.remove('hidden');
  } else {
    quietField.classList.add('hidden');
  }

  // Nullpost policy subtext
  const quietNote = document.getElementById('quiet-note');
  if (quietNote) {
    const policy = meta.nullpost_policy ?? 'any';
    if (meta.allow_nullpost && policy !== 'any') {
      const policyLabels: Record<string, string> = {
        chanid_only: 'Requires a Chan ID',
        verified_only: 'Requires a verified Chan ID',
        moderator_only: 'Moderators only',
      };
      quietNote.textContent = policyLabels[policy] ?? '';
      quietNote.classList.remove('hidden');
    } else {
      quietNote.classList.add('hidden');
    }
  }
}

/**
 * Restore a previously saved chanid for the given board from localStorage.
 */
function restoreChanid(boardId: string): void {
  const input = document.getElementById('chanid') as HTMLInputElement | null;
  if (!input) return;
  const saved = getSavedChanid(boardId);
  if (saved) input.value = saved;
}

/**
 * Save the chanid for the given board to localStorage.
 */
function saveChanid(boardId: string, value: string): void {
  if (!value) {
    localStorage.removeItem(`dyschan_chanid_${boardId}`);
  } else {
    localStorage.setItem(`dyschan_chanid_${boardId}`, value);
  }
}

function getSavedChanid(boardId: string): string | null {
  return localStorage.getItem(`dyschan_chanid_${boardId}`);
}

/**
 * Auto-save chanid to localStorage on each input change.
 */
function setupChanidAutoSave(boardId: string): void {
  const input = document.getElementById('chanid') as HTMLInputElement | null;
  if (!input) return;
  // Remove stale listener by cloning (avoids duplicate registrations)
  const newInput = input.cloneNode(true) as HTMLInputElement;
  input.parentNode?.replaceChild(newInput, input);
  newInput.addEventListener('input', () => {
    saveChanid(boardId, newInput.value);
  });
}

async function fetchBoardMeta(boardId: string): Promise<BoardMeta | null> {
  try {
    const boardUrl = new URL(BOARD_ENDPOINT!);
    boardUrl.searchParams.set('board_id', boardId);
    boardUrl.searchParams.set('limit', '0');
    const res = await fetch(boardUrl.href);
    if (!res.ok) return null;
    const data = await res.json() as BoardData;
    return (data.board ?? null) as BoardMeta | null;
  } catch {
    return null;
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
      }, boardId, '')}
      <div class="thread-preview-footer">
        <a href="thread.html#/thread/${sBoardId}/${encodeURIComponent(t.thread_id)}">
          ${escapeHtml(formatReplyCount(t.post_count))}
        </a>
        <span class="meta">Thread ${escapeHtml(t.thread_id.slice(0,8))}... \u00b7 last: ${escapeHtml(new Date((t.last_post ?? 0) * 1000).toLocaleString())}</span>
      </div>
    </div>
  `).join('');
}

async function submitThread(boardId: string): Promise<void> {
  const bodyEl = document.getElementById('thread-body') as HTMLTextAreaElement | null;
  const statusEl = document.getElementById('thread-status') as HTMLElement | null;
  const secretEl = document.getElementById('user-secret') as HTMLInputElement | null;
  const chanidEl = document.getElementById('chanid') as HTMLInputElement | null;
  const quietEl = document.getElementById('quiet-post') as HTMLInputElement | null;
  const body = bodyEl?.value.trim() ?? '';
  if (!body) return;
  if (statusEl) statusEl.textContent = 'Computing PoW...';

  const chanid = chanidEl?.value.trim() || undefined;
  const quiet = quietEl?.checked || undefined;

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
    const payload: Record<string, unknown> = { board_id: boardId, timestamp, body, body_hash: bh, pow, style_seed: styleSeedVal, client_meta: { version: '0.9.0' } };
    if (chanid) payload.chanid = chanid;
    if (quiet) payload.quiet = true;
    const res = await fetch(THREAD_ENDPOINT!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

  // Set board breadcrumb from saved boards
  const saved = getSavedBoards();
  const board = saved.find(b => b.id === boardId);
  const boardLink = document.getElementById('board-link') as HTMLAnchorElement | null;
  if (boardLink) {
    boardLink.textContent = board?.name ?? boardId;
    const encoded = encodeURIComponent(boardId);
    boardLink.href = `board.html?board_id=${encoded}#/board/${encoded}`;
  }

  document.getElementById('reply-form')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    await submitPost(boardId, threadId);
  });

  // Fetch board meta for UI adaptation (don't block thread load on failure)
  const meta = await fetchBoardMeta(boardId);
  if (meta) {
    currentBoardMeta = meta;
    renderBoardInfo(meta);
    adaptToBoardConfig(meta);
    restoreChanid(boardId);
    setupChanidAutoSave(boardId);
  }

  await loadThread(boardId, threadId);
}

interface PostData {
  post_id?: string;
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
    // Update breadcrumb and page title
    const titleEl = document.getElementById('thread-title');
    if (titleEl) titleEl.textContent = threadId.slice(0, 8) + '…';
    document.title = `Thread ${threadId.slice(0, 8)}…`;
    renderPosts(data.posts ?? [], container, boardId, threadId);
  } catch (err) {
    container.textContent = `Network error: ${(err as Error).message}`;
  }
}

function renderPosts(posts: PostData[], container: HTMLElement, boardId: string, threadId: string): void {
  if (!posts.length) { container.innerHTML = '<p>No posts.</p>'; return; }
  container.innerHTML = posts.map(p => renderPostMarkup(p, boardId, threadId)).join('');
}

function renderPostMarkup(data: PostData, boardId: string, threadId: string): string {
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
      ${data.post_id ? `<button class="report-btn" data-board-id="${escapeHtml(boardId)}" data-thread-id="${escapeHtml(threadId)}" data-post-id="${escapeHtml(data.post_id)}">Report</button>` : ''}
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
  const chanidEl = document.getElementById('chanid') as HTMLInputElement | null;
  const quietEl = document.getElementById('quiet-post') as HTMLInputElement | null;
  const body = bodyEl?.value.trim() ?? '';
  if (!body) return;
  if (statusEl) statusEl.textContent = 'Computing PoW...';

  const chanid = chanidEl?.value.trim() || undefined;
  const quiet = quietEl?.checked || undefined;

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
    const payload: Record<string, unknown> = { thread_id: threadId, board_id: boardId, timestamp, body, body_hash: bh, pow, style_seed: styleSeedVal, client_meta: { version: '0.9.0' } };
    if (chanid) payload.chanid = chanid;
    if (quiet) payload.quiet = true;
    const res = await fetch(POST_ENDPOINT!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

// ---- Flag / Report ----
async function submitFlag(): Promise<void> {
  const boardId = (document.getElementById('flag-board-id') as HTMLInputElement).value;
  const threadId = (document.getElementById('flag-thread-id') as HTMLInputElement).value;
  const postId = (document.getElementById('flag-post-id') as HTMLInputElement).value;
  const reasonEl = document.querySelector('input[name="flag-reason"]:checked') as HTMLInputElement | null;
  const detailsEl = document.getElementById('flag-details') as HTMLTextAreaElement | null;
  const statusEl = document.getElementById('flag-status') as HTMLElement | null;

  if (!reasonEl) { if (statusEl) statusEl.textContent = 'Please select a reason.'; return; }
  const reason = reasonEl.value;
  const details = detailsEl?.value.trim() || undefined;

  if (statusEl) statusEl.textContent = 'Computing PoW...';

  const timestamp = Math.floor(Date.now() / 1000);
  const contentHash = await sha256hex(`flag:${boardId}:${threadId}:${postId}:${reason}`);
  const powSaltKey = 'dyschan_pow_salt';
  const salt = localStorage.getItem(powSaltKey) ?? (() => {
    const s = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(powSaltKey, s);
    return s;
  })();
  const pow = await solvePow({ timestamp, threadId, boardId, bodyHash: contentHash, salt, difficulty: DIFFICULTY });

  if (statusEl) statusEl.textContent = 'Submitting report...';
  try {
    const res = await fetch(FLAG_ENDPOINT!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: boardId, thread_id: threadId, post_id: postId, reason, details, timestamp, pow }),
    });
    const data = await res.json();
    if (data.ok) {
      if (statusEl) statusEl.textContent = 'Report submitted. Thank you.';
      setTimeout(() => {
        document.getElementById('flag-modal')?.classList.add('hidden');
      }, 1500);
    } else {
      if (statusEl) statusEl.textContent = 'Error: ' + JSON.stringify(data);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Network error: ' + (err as Error).message;
  }
}

// ---- Event delegation for report modal ----
document.addEventListener('click', (e: MouseEvent) => {
  if (page !== 'thread' || missingEndpointKeys.length > 0) return;
  const target = e.target as HTMLElement;

  const reportBtn = target.closest('.report-btn') as HTMLElement | null;
  if (reportBtn) {
    const boardId = reportBtn.dataset['boardId'] ?? '';
    const threadId = reportBtn.dataset['threadId'] ?? '';
    const postId = reportBtn.dataset['postId'] ?? '';
    const boardInput = document.getElementById('flag-board-id') as HTMLInputElement | null;
    const threadInput = document.getElementById('flag-thread-id') as HTMLInputElement | null;
    const postInput = document.getElementById('flag-post-id') as HTMLInputElement | null;
    if (!boardInput || !threadInput || !postInput) return;
    boardInput.value = boardId;
    threadInput.value = threadId;
    postInput.value = postId;
    const statusEl = document.getElementById('flag-status');
    if (statusEl) statusEl.textContent = '';
    document.getElementById('flag-modal')?.classList.remove('hidden');
    return;
  }

  if (target.closest('.flag-submit-btn')) {
    submitFlag();
    return;
  }

  if (target.closest('.close-modal') || target.closest('#flag-modal') && !target.closest('.modal-content')) {
    document.getElementById('flag-modal')?.classList.add('hidden');
    return;
  }
});

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
  const requiredKeys: string[] = REQUIRED_ENDPOINTS_BY_PAGE[currentPage] ?? [];
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