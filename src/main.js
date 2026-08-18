import './style.css';
import Peer from 'peerjs';
import QRCode from 'qrcode';

const app = document.querySelector('#app');
const ROWS = 8;
const COLS = 10;
const DIRS = [
  { dr: -1, dc: 0, name: 'N' },
  { dr: 0, dc: 1, name: 'E' },
  { dr: 1, dc: 0, name: 'S' },
  { dr: 0, dc: -1, name: 'W' },
];
const PIECE_NAMES = { laser: '레이저', splitter: '스플리터', king: '왕', triangle: '세모기사', square: '네모기사' };
const ui = { toastTimer: null };
let peer = null;
let hostConnections = new Map();
let stationConnection = null;
let heartbeatTimer = null;

const safe = (value = '') => String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => Date.now();
const fmtTime = ms => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};
const getParams = () => new URLSearchParams(location.search);
const mode = () => getParams().get('mode') || 'home';
const roomCode = () => (getParams().get('room') || '').toUpperCase();
const navigate = params => { location.href = `${location.pathname}?${params}`; };

function toast(message, tone = 'info') {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.remove(), 2800);
}

const tone = (() => {
  let ctx;
  const play = (freq, duration = .08, type = 'sine', gain = .06, delay = 0) => {
    try {
      ctx ||= new AudioContext();
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      amp.gain.setValueAtTime(0, ctx.currentTime + delay);
      amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + .01);
      amp.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + delay + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + duration + .02);
    } catch { /* audio is enhancement only */ }
  };
  return {
    click: () => play(510, .06, 'triangle', .035),
    move: () => play(180, .09, 'square', .035),
    rotate: () => { play(260, .07, 'triangle', .04); play(390, .08, 'triangle', .035, .06); },
    laser: () => { play(820, .24, 'sawtooth', .035); play(1180, .18, 'sine', .025, .06); },
    hit: () => { play(120, .25, 'square', .08); play(70, .32, 'sawtooth', .04, .03); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => play(f, .22, 'triangle', .055, i * .11)),
  };
})();
document.addEventListener('click', e => { if (e.target.closest('button')) tone.click(); });

function header(title, subtitle = '') {
  return `<header class="topbar"><div class="brand-mark">LZ</div><div><p class="eyebrow">THE GENIUS · CLASS EDITION</p><h1>${safe(title)}</h1>${subtitle ? `<p class="subtitle">${safe(subtitle)}</p>` : ''}</div><button class="icon-btn" data-action="home" aria-label="메인 화면">⌂</button></header>`;
}

function homeView() {
  app.innerHTML = `<main class="home shell">
    <section class="hero-panel">
      <div class="orbital"><span></span><span></span><i>王</i></div>
      <p class="eyebrow">THE GENIUS · CLASS EDITION</p>
      <h1>레이저 장기</h1>
      <p class="hero-copy">빛의 경로를 설계하고, 상대의 왕을 제거하라.</p>
      <div class="hero-actions">
        <button class="primary large" data-action="open-host">교사 운영 페이지</button>
        <button class="secondary large" data-action="open-station">학생 경기장 접속</button>
      </div>
      <button class="text-btn" data-action="practice">연결 없이 연습 경기</button>
    </section>
    <footer>한 대의 태블릿 · 두 명의 플레이어 · 휘발성 경기 기록</footer>
  </main>`;
}

function hostState() {
  const cached = sessionStorage.getItem('laser-host');
  return cached ? JSON.parse(cached) : {
    room: Math.random().toString(36).slice(2, 7).toUpperCase(),
    title: '우리 반 레이저 장기', players: [], stations: {}, matches: [], active: {},
    started: false, ended: false, createdAt: now()
  };
}
let host = null;
function saveHost() {
  if (host) sessionStorage.setItem('laser-host', JSON.stringify(host));
  syncBoard();
}

function hostView() {
  host = hostState();
  app.innerHTML = `${header('레이저 장기 관제실', '모든 데이터는 이 탭에만 임시 저장됩니다.')}
  <main class="host-layout shell wide">
    <section class="panel setup-panel">
      <div class="section-head"><div><p class="kicker">SESSION CONTROL</p><h2>게임 운영</h2></div><span class="live-pill ${host.started && !host.ended ? 'on' : ''}">${host.ended ? '종료됨' : host.started ? '운영 중' : '준비 중'}</span></div>
      <label>게임 이름<input id="room-title" value="${safe(host.title)}" ${host.started ? 'disabled' : ''}></label>
      <label>플레이어 등록 <span class="hint">줄바꿈 또는 쉼표로 구분</span>
        <textarea id="roster" rows="7" ${host.started ? 'disabled' : ''} placeholder="김민준&#10;이서준&#10;박지호">${safe(host.players.map(p => p.name).join('\n'))}</textarea>
      </label>
      <div class="button-row">
        ${!host.started ? '<button class="primary" data-action="start-session">게임 운영 시작</button>' : ''}
        ${host.started && !host.ended ? '<button class="danger" data-action="end-session">게임 운영 종료</button>' : ''}
        ${host.ended ? '<button class="secondary" data-action="new-session">새 게임방</button>' : ''}
      </div>
      <p class="privacy-note">탭을 닫으면 기록이 사라집니다. 종료 전에 로그를 내려받으세요.</p>
    </section>
    <section class="panel connection-panel">
      <div class="section-head"><div><p class="kicker">STUDENT ACCESS</p><h2>경기장 접속</h2></div><b class="room-code">${host.room}</b></div>
      <div class="qr-wrap"><canvas id="qr"></canvas><div><p>학생 태블릿에서 QR을 스캔하세요.</p><button class="secondary small" data-action="copy-link">링크 복사</button></div></div>
      <div class="connection-status" id="peer-status"><span></span> 연결 준비 중</div>
    </section>
    <section class="panel stations-panel"><div class="section-head"><div><p class="kicker">LIVE ARENAS</p><h2>경기장 현황</h2></div><strong>${Object.keys(host.stations).length}대 연결</strong></div><div id="station-grid"></div></section>
    <section class="panel scoreboard-panel"><div class="section-head"><div><p class="kicker">LIVE SCOREBOARD</p><h2>실시간 순위</h2></div><button class="secondary small" data-action="fullscreen-board">전광판 크게 보기</button></div><div id="ranking"></div></section>
    <section class="panel results-panel"><div class="section-head"><div><p class="kicker">MATCH FEED</p><h2>최근 경기 결과</h2></div><span>${host.matches.length}경기 완료</span></div><div id="match-feed"></div></section>
    <section class="panel export-panel"><div><h2>경기 로그</h2><p>운영 종료 후 CSV와 JSON으로 내려받을 수 있습니다.</p></div><div class="button-row"><button class="secondary" data-action="download-csv" ${!host.matches.length ? 'disabled' : ''}>CSV 다운로드</button><button class="secondary" data-action="download-json" ${!host.matches.length ? 'disabled' : ''}>JSON 다운로드</button><button class="danger ghost" data-action="purge" ${!host.ended ? 'disabled' : ''}>기록 완전 삭제</button></div></section>
  </main>`;
  renderHostDynamic();
  const studentUrl = `${location.origin}${location.pathname}?mode=station&room=${host.room}`;
  QRCode.toCanvas(document.querySelector('#qr'), studentUrl, { width: 160, margin: 1, color: { dark: '#07111fff', light: '#f4ead4ff' } });
  if (host.started && !host.ended) startHostPeer();
}

function standings() {
  if (!host) return [];
  const stats = Object.fromEntries(host.players.map(p => [p.id, { ...p, wins: 0, losses: 0, points: 0, streak: 0 }]));
  host.matches.filter(m => !m.void).forEach(m => {
    if (stats[m.winnerId]) { stats[m.winnerId].wins++; stats[m.winnerId].points += 3; }
    if (stats[m.loserId]) stats[m.loserId].losses++;
  });
  return Object.values(stats).sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
}

function stationStatus(s) {
  if (now() - (s.lastSeen || 0) > 30000) return ['offline', '연결 끊김'];
  return s.status === 'playing' ? ['playing', '게임 진행 중'] : s.status === 'result' ? ['result', '결과 전송 중'] : ['ready', '대기 중'];
}

function renderHostDynamic() {
  if (!host) return;
  const stations = Object.values(host.stations).sort((a, b) => Number(a.number) - Number(b.number));
  const grid = document.querySelector('#station-grid');
  if (grid) grid.innerHTML = stations.length ? stations.map(s => {
    const [cls, label] = stationStatus(s);
    const active = host.active[s.activeMatchId];
    return `<article class="station-card ${cls}"><div><b>${safe(s.number)}번 경기장</b><span class="status-dot">${label}</span></div>${active ? `<strong>${safe(active.blueName)} <em>VS</em> ${safe(active.redName)}</strong><small>${fmtTime(now() - active.startedAt)} · ${active.turnCount || 0}턴</small>` : '<p>새로운 도전자를 기다립니다.</p>'}</article>`;
  }).join('') : '<div class="empty">연결된 학생 태블릿이 없습니다.</div>';
  const rank = standings();
  const ranking = document.querySelector('#ranking');
  if (ranking) ranking.innerHTML = rank.length ? `<table><thead><tr><th>순위</th><th>플레이어</th><th>승</th><th>패</th><th>승점</th></tr></thead><tbody>${rank.map((p, i) => `<tr><td><span class="rank rank-${i + 1}">${i + 1}</span></td><td>${safe(p.name)}</td><td>${p.wins}</td><td>${p.losses}</td><td><b>${p.points}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty">플레이어를 등록하면 순위가 표시됩니다.</div>';
  const feed = document.querySelector('#match-feed');
  if (feed) feed.innerHTML = host.matches.length ? host.matches.slice().reverse().slice(0, 8).map(m => `<article class="feed-item"><span class="win-icon">W</span><div><b>${safe(m.winnerName)}</b> 승리 <small>${safe(m.loserName)}에게 승리 · ${safe(m.stationNumber)}번 경기장</small></div><strong>${fmtTime(m.durationMs)}</strong></article>`).join('') : '<div class="empty">완료된 경기가 없습니다.</div>';
}

function broadcastRoster() {
  const data = { type: 'ROSTER', players: host.players, sessionTitle: host.title, ended: host.ended };
  hostConnections.forEach(conn => { if (conn.open) conn.send(data); });
}

function startHostPeer() {
  if (peer && !peer.destroyed) return;
  peer = new Peer(`laser-${host.room.toLowerCase()}`);
  const status = document.querySelector('#peer-status');
  peer.on('open', () => { if (status) status.innerHTML = '<span class="ok"></span> 학생 접속 가능'; });
  peer.on('error', err => { if (status) status.innerHTML = `<span class="bad"></span> 연결 오류: ${safe(err.type)}`; });
  peer.on('connection', conn => {
    conn.on('open', () => {
      hostConnections.set(conn.peer, conn);
      conn.send({ type: 'WELCOME', players: host.players, sessionTitle: host.title, ended: host.ended });
    });
    conn.on('data', data => handleHostMessage(conn, data));
    conn.on('close', () => hostConnections.delete(conn.peer));
  });
  setInterval(() => renderHostDynamic(), 1000);
}

function playerBusy(id) { return Object.values(host.active).some(m => m.blueId === id || m.redId === id); }
function handleHostMessage(conn, data) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'REGISTER_STATION') {
    host.stations[data.stationId] = { stationId: data.stationId, number: data.number, status: 'ready', lastSeen: now() };
    conn.metadata = { stationId: data.stationId };
    conn.send({ type: 'ROSTER', players: host.players, sessionTitle: host.title, ended: host.ended });
  }
  if (data.type === 'HEARTBEAT') {
    const station = host.stations[data.stationId];
    if (station) { station.lastSeen = now(); station.status = data.status || station.status; }
    const match = host.active[data.matchId];
    if (match) match.turnCount = data.turnCount || match.turnCount;
  }
  if (data.type === 'MATCH_START_REQUEST') {
    const blue = host.players.find(p => p.id === data.blueId);
    const red = host.players.find(p => p.id === data.redId);
    let reason = '';
    if (!blue || !red) reason = '등록되지 않은 플레이어입니다.';
    else if (blue.id === red.id) reason = '서로 다른 두 명을 선택하세요.';
    else if (playerBusy(blue.id) || playerBusy(red.id)) reason = '선택한 플레이어가 다른 경기 중입니다.';
    else if (host.ended) reason = '게임 운영이 종료되었습니다.';
    if (reason) return conn.send({ type: 'MATCH_START_REJECTED', reason });
    const matchId = uid('match');
    const match = { matchId, stationId: data.stationId, stationNumber: data.stationNumber, blueId: blue.id, blueName: blue.name, redId: red.id, redName: red.name, startedAt: now(), turnCount: 0 };
    host.active[matchId] = match;
    Object.assign(host.stations[data.stationId], { status: 'playing', activeMatchId: matchId, lastSeen: now() });
    saveHost();
    conn.send({ type: 'MATCH_START_APPROVED', match });
  }
  if (data.type === 'MATCH_RESULT') {
    if (host.matches.some(m => m.matchId === data.matchId)) return conn.send({ type: 'RESULT_ACCEPTED', matchId: data.matchId });
    const active = host.active[data.matchId];
    if (!active) return conn.send({ type: 'RESULT_REJECTED', reason: '호스트에서 진행 중인 경기 정보를 찾지 못했습니다.' });
    const winnerId = data.winnerId;
    const loserId = winnerId === active.blueId ? active.redId : active.blueId;
    const result = { ...active, winnerId, loserId, winnerName: winnerId === active.blueId ? active.blueName : active.redName, loserName: winnerId === active.blueId ? active.redName : active.blueName, endedAt: now(), durationMs: data.durationMs, turnCount: data.turnCount, reason: data.reason || 'king_destroyed' };
    host.matches.push(result);
    delete host.active[data.matchId];
    Object.assign(host.stations[data.stationId], { status: 'ready', activeMatchId: null, lastSeen: now() });
    saveHost(); renderHostDynamic();
    conn.send({ type: 'RESULT_ACCEPTED', matchId: data.matchId });
  }
  if (data.type === 'MATCH_ABORT') {
    const active = host.active[data.matchId];
    if (active) delete host.active[data.matchId];
    if (host.stations[data.stationId]) Object.assign(host.stations[data.stationId], { status: 'ready', activeMatchId: null, lastSeen: now() });
    saveHost();
  }
  saveHost(); renderHostDynamic();
}

function stationState() {
  const key = `laser-station-${roomCode() || 'practice'}`;
  const cached = localStorage.getItem(key);
  return cached ? JSON.parse(cached) : { stationId: uid('station'), number: '', status: 'setup', players: [], match: null, game: null };
}
let station = null;
function saveStation() { if (station) localStorage.setItem(`laser-station-${roomCode() || 'practice'}`, JSON.stringify(station)); }

function stationView(practice = false) {
  station = stationState();
  if (practice) {
    station.number = '연습'; station.status = station.game ? 'playing' : 'ready';
    station.players = [{ id: 'practice-blue', name: '청색 플레이어' }, { id: 'practice-red', name: '적색 플레이어' }];
    if (!station.game) startLocalGame({ matchId: uid('practice'), stationNumber: '연습', blueId: 'practice-blue', blueName: '청색 플레이어', redId: 'practice-red', redName: '적색 플레이어', startedAt: now() }, true);
    else gameView(true);
    return;
  }
  if (!roomCode()) return stationJoinView();
  if (!station.number) return stationRegisterView();
  stationLobbyView();
  connectStation();
}

function stationJoinView() {
  app.innerHTML = `${header('학생 경기장 접속')}<main class="center shell"><section class="panel join-card"><p class="kicker">ENTER ARENA</p><h2>방 코드를 입력하세요</h2><input id="join-code" class="code-input" maxlength="8" placeholder="LZ4827"><button class="primary large" data-action="join-room">경기장 접속</button></section></main>`;
}

function stationRegisterView() {
  app.innerHTML = `${header('경기장 등록', `방 코드 ${roomCode()}`)}<main class="center shell"><section class="panel join-card"><p class="kicker">ARENA NUMBER</p><h2>이 태블릿의 경기장 번호</h2><div class="number-grid">${Array.from({ length: 13 }, (_, i) => `<button class="number-btn" data-action="set-station" data-number="${i + 1}">${i + 1}</button>`).join('')}</div><p class="hint">태블릿마다 서로 다른 번호를 선택하세요.</p></section></main>`;
}

function stationLobbyView() {
  app.innerHTML = `${header(`${safe(station.number)}번 경기장`, `방 코드 ${roomCode()}`)}<main class="station-shell shell">
    <section class="panel player-select"><div class="connection-status" id="station-peer">${stationConnection?.open ? '<span class="ok"></span> 교사 화면 연결됨' : '<span></span> 교사 화면 연결 중'}</div><p class="kicker">PLAYER MATCHING</p><h2>도전자 두 명을 선택하세요</h2>
      <div class="versus-select"><label class="blue-side">청색 플레이어<select id="blue-player"><option value="">이름 선택</option>${station.players.map(p => `<option value="${p.id}">${safe(p.name)}</option>`).join('')}</select></label><b>VS</b><label class="red-side">적색 플레이어<select id="red-player"><option value="">이름 선택</option>${station.players.map(p => `<option value="${p.id}">${safe(p.name)}</option>`).join('')}</select></label></div>
      <button class="primary large" data-action="request-match" ${stationConnection?.open ? '' : 'disabled'}>두 선수 확인 · 경기 시작</button>
      ${station.game ? '<button class="secondary" data-action="resume-game">진행 중인 경기 이어하기</button>' : ''}
    </section></main>`;
}

function connectStation() {
  if (stationConnection?.open || peer) return;
  peer = new Peer();
  peer.on('open', () => {
    stationConnection = peer.connect(`laser-${roomCode().toLowerCase()}`, { reliable: true });
    stationConnection.on('open', () => {
      stationConnection.send({ type: 'REGISTER_STATION', stationId: station.stationId, number: station.number });
      const el = document.querySelector('#station-peer'); if (el) el.innerHTML = '<span class="ok"></span> 교사 화면 연결됨';
      document.querySelector('[data-action="request-match"]')?.removeAttribute('disabled');
      heartbeatTimer = setInterval(sendHeartbeat, 10000);
    });
    stationConnection.on('data', handleStationMessage);
    stationConnection.on('close', () => { const el = document.querySelector('#station-peer'); if (el) el.innerHTML = '<span class="bad"></span> 연결 끊김 · 자동 재연결 중'; peer = null; stationConnection = null; setTimeout(connectStation, 2500); });
  });
  peer.on('error', () => { peer = null; stationConnection = null; setTimeout(connectStation, 3000); });
}

function sendHeartbeat() {
  if (stationConnection?.open) stationConnection.send({ type: 'HEARTBEAT', stationId: station.stationId, status: station.game ? 'playing' : 'ready', matchId: station.match?.matchId, turnCount: station.game?.turnCount || 0 });
}

function handleStationMessage(data) {
  if (data.type === 'WELCOME' || data.type === 'ROSTER') {
    station.players = data.players || [];
    saveStation();
    if (!station.game) stationLobbyView();
  }
  if (data.type === 'MATCH_START_REJECTED') toast(data.reason, 'error');
  if (data.type === 'MATCH_START_APPROVED') { station.match = data.match; startLocalGame(data.match); }
  if (data.type === 'RESULT_ACCEPTED') {
    station.game = null; station.match = null; station.status = 'ready'; saveStation();
    resultAcceptedView();
  }
  if (data.type === 'RESULT_REJECTED') toast(data.reason, 'error');
}

function initialPieces() {
  const P = (id, owner, type, r, c, dir) => ({ id, owner, type, r, c, dir, alive: true });
  return [
    P('b-l','blue','laser',7,0,1), P('b-k','blue','king',7,4,0), P('b-sp','blue','splitter',6,4,0),
    P('b-t1','blue','triangle',7,2,0), P('b-t2','blue','triangle',6,2,1), P('b-t3','blue','triangle',6,6,3), P('b-t4','blue','triangle',5,3,0), P('b-t5','blue','triangle',5,7,3),
    P('b-s1','blue','square',7,6,1), P('b-s2','blue','square',6,8,2),
    P('r-l','red','laser',0,9,3), P('r-k','red','king',0,5,2), P('r-sp','red','splitter',1,5,2),
    P('r-t1','red','triangle',0,7,2), P('r-t2','red','triangle',1,7,3), P('r-t3','red','triangle',1,3,1), P('r-t4','red','triangle',2,6,2), P('r-t5','red','triangle',2,2,1),
    P('r-s1','red','square',0,3,3), P('r-s2','red','square',1,1,0)
  ];
}

function startLocalGame(match, practice = false) {
  station.match = match;
  station.status = 'playing';
  station.game = { pieces: initialPieces(), turn: 'blue', turnCount: 0, selectedId: null, startedAt: match.startedAt || now(), beams: [], message: '청색 플레이어의 차례입니다.', over: false, practice };
  saveStation(); sendHeartbeat(); gameView(practice);
}

function pieceGlyph(p) {
  if (p.type === 'king') return '王';
  if (p.type === 'laser') return '◉';
  if (p.type === 'splitter') return '◇';
  if (p.type === 'triangle') return '▲';
  return '■';
}
function pieceAt(r, c) { return station.game.pieces.find(p => p.alive && p.r === r && p.c === c); }
function gameView(practice = station.game?.practice) {
  const g = station.game;
  if (!g) return stationLobbyView();
  const blue = station.match.blueName, red = station.match.redName;
  app.innerHTML = `<main class="game-screen">
    <header class="game-hud red-hud"><div><span>적색</span><strong>${safe(red)}</strong></div><div class="turn-signal ${g.turn === 'red' ? 'active' : ''}">${g.turn === 'red' ? '현재 차례' : '대기'}</div></header>
    <section class="board-stage"><div class="game-info"><span>${safe(station.number)}번 경기장</span><b id="game-clock">${fmtTime(now() - g.startedAt)}</b><span><i id="turn-count">${g.turnCount}</i>턴</span></div>
      <div class="board-wrap"><div id="board" class="board"></div><svg id="laser-layer" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="none"></svg></div>
      <div class="game-message" id="game-message">${safe(g.message)}</div>
      <div class="game-controls"><button class="secondary" data-action="rotate-left">↶ 왼쪽 회전</button><button class="secondary" data-action="rotate-right">오른쪽 회전 ↷</button><button class="danger ghost" data-action="abort-match">경기 취소</button></div>
    </section>
    <header class="game-hud blue-hud"><div><span>청색</span><strong>${safe(blue)}</strong></div><div class="turn-signal ${g.turn === 'blue' ? 'active' : ''}">${g.turn === 'blue' ? '현재 차례' : '대기'}</div></header>
    ${g.over ? resultOverlay() : ''}
  </main>`;
  renderBoard();
  const tick = setInterval(() => { const clock = document.querySelector('#game-clock'); if (!clock || station.game !== g) return clearInterval(tick); clock.textContent = fmtTime(now() - g.startedAt); }, 1000);
}

function renderBoard() {
  const g = station.game;
  const board = document.querySelector('#board'); if (!board) return;
  board.innerHTML = Array.from({ length: ROWS * COLS }, (_, idx) => {
    const r = Math.floor(idx / COLS), c = idx % COLS, p = pieceAt(r, c);
    const selected = p?.id === g.selectedId;
    return `<button class="cell ${(r + c) % 2 ? 'odd' : ''} ${selected ? 'selected' : ''}" data-r="${r}" data-c="${c}" aria-label="${p ? `${p.owner === 'blue' ? '청색' : '적색'} ${PIECE_NAMES[p.type]}` : '빈 칸'}">${p ? `<span class="piece ${p.owner} ${p.type}" style="--dir:${p.dir * 90}deg"><i>${pieceGlyph(p)}</i><em></em></span>` : ''}</button>`;
  }).join('');
}

function handleCell(r, c) {
  const g = station.game; if (!g || g.over) return;
  const p = pieceAt(r, c);
  const selected = g.pieces.find(x => x.id === g.selectedId);
  if (!selected) {
    if (!p || p.owner !== g.turn) return toast('현재 차례의 말을 선택하세요.', 'error');
    g.selectedId = p.id; g.message = `${PIECE_NAMES[p.type]} 선택 · 이동할 칸을 누르거나 회전하세요.`; saveStation(); renderBoard(); document.querySelector('#game-message').textContent = g.message; return;
  }
  if (p?.owner === g.turn) { g.selectedId = p.id; renderBoard(); return; }
  if (selected.type === 'laser') return toast('레이저는 이동할 수 없습니다. 방향만 바꿀 수 있습니다.', 'error');
  if (p) return toast('다른 말이 있는 칸으로 이동할 수 없습니다.', 'error');
  if (Math.max(Math.abs(selected.r - r), Math.abs(selected.c - c)) !== 1) return toast('상하좌우 또는 대각선으로 한 칸만 이동할 수 있습니다.', 'error');
  selected.r = r; selected.c = c; tone.move(); completeAction();
}

function rotateSelected(delta) {
  const g = station.game; if (!g || g.over) return;
  const p = g.pieces.find(x => x.id === g.selectedId);
  if (!p) return toast('회전할 말을 먼저 선택하세요.', 'error');
  const next = (p.dir + delta + 4) % 4;
  if (p.type === 'laser') {
    const nr = p.r + DIRS[next].dr, nc = p.c + DIRS[next].dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return toast('레이저를 게임판 바깥쪽으로 돌릴 수 없습니다.', 'error');
  }
  p.dir = next; tone.rotate(); completeAction();
}

function completeAction() {
  const g = station.game;
  g.selectedId = null; g.turnCount += 1; g.message = '레이저 발사!'; saveStation(); gameView();
  setTimeout(() => fireLaser(g.turn), 180);
}

function reflectDirection(inDir, mirrorDir) {
  // A 45° mirror has two reflective entry directions; rotating changes the pair.
  const relative = (inDir - mirrorDir + 4) % 4;
  if (relative === 0) return (inDir + 1) % 4;
  if (relative === 3) return (inDir + 3) % 4;
  return null;
}

function traceRay(r, c, dir, segments, hits, visited, depth = 0) {
  if (depth > 10) return;
  let cr = r, cc = c, cd = dir;
  for (let steps = 0; steps < 120; steps++) {
    const key = `${cr},${cc},${cd}`; if (visited.has(key)) return; visited.add(key);
    const nr = cr + DIRS[cd].dr, nc = cc + DIRS[cd].dc;
    segments.push({ r1: cr + .5, c1: cc + .5, r2: nr + .5, c2: nc + .5 });
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
    cr = nr; cc = nc;
    const hit = pieceAt(cr, cc); if (!hit) continue;
    if (hit.type === 'laser') return;
    if (hit.type === 'king') { hits.push(hit); return; }
    if (hit.type === 'splitter') {
      const reflected = reflectDirection(cd, hit.dir);
      if (reflected !== null) traceRay(cr, cc, reflected, segments, hits, new Set(visited), depth + 1);
      continue;
    }
    const reflected = reflectDirection(cd, hit.dir);
    if (reflected === null) { hits.push(hit); return; }
    cd = reflected;
  }
}

function fireLaser(owner) {
  const g = station.game; if (!g || g.over) return;
  const laser = g.pieces.find(p => p.alive && p.owner === owner && p.type === 'laser');
  const segments = [];
  const hits = [];
  traceRay(laser.r, laser.c, laser.dir, segments, hits, new Set());
  drawBeams(segments); tone.laser();
  setTimeout(() => {
    const uniqueHits = [...new Map(hits.map(hit => [hit.id, hit])).values()];
    if (uniqueHits.length) {
      uniqueHits.forEach(hit => { hit.alive = false; }); tone.hit();
      const kingHit = uniqueHits.find(hit => hit.type === 'king');
      if (kingHit) {
        g.over = true; g.winnerId = owner === 'blue' ? station.match.blueId : station.match.redId; g.message = `${owner === 'blue' ? station.match.blueName : station.match.redName} 승리!`; saveStation(); tone.win(); gameView(); return;
      }
      g.message = uniqueHits.map(hit => `${hit.owner === 'blue' ? '청색' : '적색'} ${PIECE_NAMES[hit.type]}`).join(', ') + ' 제거';
    } else g.message = '레이저가 판 밖으로 빠져나갔습니다.';
    g.turn = owner === 'blue' ? 'red' : 'blue'; saveStation(); gameView(); sendHeartbeat();
  }, Math.min(1100, 280 + segments.length * 45));
}

function drawBeams(segments) {
  const layer = document.querySelector('#laser-layer'); if (!layer) return;
  layer.innerHTML = segments.map(s => `<line x1="${s.c1}" y1="${s.r1}" x2="${s.c2}" y2="${s.r2}" />`).join('');
  layer.classList.add('firing');
}

function resultOverlay() {
  const g = station.game;
  const winner = g.winnerId === station.match.blueId ? station.match.blueName : station.match.redName;
  const loser = g.winnerId === station.match.blueId ? station.match.redName : station.match.blueName;
  return `<div class="result-overlay"><section class="result-modal"><p class="kicker">KING ELIMINATED</p><div class="victory-emblem">王</div><h2>${safe(winner)} 승리</h2><p>${safe(loser)}의 왕이 레이저에 맞았습니다.</p><div class="result-stats"><span><b>${g.turnCount}</b>턴</span><span><b>${fmtTime(now() - g.startedAt)}</b>경기 시간</span></div>${g.practice ? '<button class="primary large" data-action="practice-rematch">다시 연습하기</button>' : '<button class="primary large" data-action="submit-result">두 선수 확인 · 결과 전송</button>'}<small>결과 전송 후 교사 전광판에 즉시 반영됩니다.</small></section></div>`;
}

function resultAcceptedView() {
  app.innerHTML = `${header(`${safe(station.number)}번 경기장`)}<main class="center shell"><section class="panel success-card"><div class="success-check">✓</div><p class="kicker">RESULT ACCEPTED</p><h2>경기 결과가 전송되었습니다</h2><p>교사 전광판과 실시간 순위에 반영되었습니다.</p><div class="countdown">다음 경기 준비 중 <b id="countdown">3</b></div></section></main>`;
  let n = 3; const timer = setInterval(() => { n--; const el = document.querySelector('#countdown'); if (el) el.textContent = n; if (n <= 0) { clearInterval(timer); stationLobbyView(); connectStation(); } }, 1000);
}

function download(name, content, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff', content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function csvLog() {
  const head = ['경기ID','경기장','청색선수','적색선수','승자','패자','경기시간(초)','턴수','시작시각','종료시각'];
  const rows = host.matches.map(m => [m.matchId,m.stationNumber,m.blueName,m.redName,m.winnerName,m.loserName,Math.round(m.durationMs/1000),m.turnCount,new Date(m.startedAt).toLocaleString('ko-KR'),new Date(m.endedAt).toLocaleString('ko-KR')]);
  return [head, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
}

document.addEventListener('click', async e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'home') navigate('');
  if (action === 'open-host') navigate('mode=host');
  if (action === 'open-station') navigate('mode=station');
  if (action === 'practice') navigate('mode=practice');
  if (action === 'join-room') { const code = document.querySelector('#join-code').value.trim(); if (code) navigate(`mode=station&room=${encodeURIComponent(code)}`); }
  if (action === 'set-station') { station.number = e.target.dataset.number; station.status = 'ready'; saveStation(); stationLobbyView(); connectStation(); }
  if (action === 'start-session') {
    const names = document.querySelector('#roster').value.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    if (names.length < 2) return toast('플레이어를 두 명 이상 등록하세요.', 'error');
    if (new Set(names).size !== names.length) return toast('중복된 이름이 있습니다.', 'error');
    host.title = document.querySelector('#room-title').value.trim() || '우리 반 레이저 장기'; host.players = names.map((name, i) => ({ id: `p-${i + 1}`, name })); host.started = true; host.ended = false; saveHost(); hostView();
  }
  if (action === 'end-session') {
    if (Object.keys(host.active).length && !confirm('진행 중인 경기가 있습니다. 그래도 운영을 종료할까요?')) return;
    host.ended = true; saveHost(); broadcastRoster(); hostView();
  }
  if (action === 'new-session') { sessionStorage.removeItem('laser-host'); host = null; peer?.destroy(); peer = null; hostView(); }
  if (action === 'copy-link') { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?mode=station&room=${host.room}`); toast('학생 접속 링크를 복사했습니다.', 'success'); }
  if (action === 'fullscreen-board') document.querySelector('.scoreboard-panel')?.requestFullscreen();
  if (action === 'download-csv') download(`레이저장기_${host.room}_경기로그.csv`, csvLog(), 'text/csv;charset=utf-8');
  if (action === 'download-json') download(`레이저장기_${host.room}_전체기록.json`, JSON.stringify({ title: host.title, room: host.room, createdAt: host.createdAt, exportedAt: now(), players: host.players, matches: host.matches, ranking: standings() }, null, 2), 'application/json');
  if (action === 'purge') { if (confirm('모든 경기 기록을 삭제할까요? 삭제 후 복구할 수 없습니다.')) { sessionStorage.removeItem('laser-host'); peer?.destroy(); navigate(''); } }
  if (action === 'request-match') {
    const blueId = document.querySelector('#blue-player').value, redId = document.querySelector('#red-player').value;
    if (!blueId || !redId || blueId === redId) return toast('서로 다른 두 명을 선택하세요.', 'error');
    stationConnection.send({ type: 'MATCH_START_REQUEST', stationId: station.stationId, stationNumber: station.number, blueId, redId }); toast('교사 화면에서 참가 가능 여부를 확인 중입니다.');
  }
  if (action === 'resume-game') gameView();
  if (action === 'rotate-left') rotateSelected(-1);
  if (action === 'rotate-right') rotateSelected(1);
  if (action === 'abort-match') {
    if (!confirm('이 경기를 취소할까요? 전적에는 반영되지 않습니다.')) return;
    const wasPractice = station.game?.practice;
    if (stationConnection?.open) stationConnection.send({ type: 'MATCH_ABORT', stationId: station.stationId, matchId: station.match?.matchId }); station.game = null; station.match = null; saveStation(); wasPractice ? stationView(true) : stationLobbyView();
  }
  if (action === 'submit-result') {
    if (!stationConnection?.open) return toast('교사 화면과 다시 연결된 뒤 결과를 전송합니다.', 'error');
    const g = station.game; stationConnection.send({ type: 'MATCH_RESULT', stationId: station.stationId, matchId: station.match.matchId, winnerId: g.winnerId, durationMs: now() - g.startedAt, turnCount: g.turnCount, reason: 'king_destroyed' }); toast('결과를 전송하고 있습니다.');
  }
  if (action === 'practice-rematch') { station.game = null; startLocalGame({ ...station.match, matchId: uid('practice'), startedAt: now() }, true); }
});

document.addEventListener('click', e => {
  const cell = e.target.closest('.cell'); if (cell) handleCell(Number(cell.dataset.r), Number(cell.dataset.c));
});

window.addEventListener('beforeunload', () => { clearInterval(heartbeatTimer); });

if (mode() === 'host') hostView();
else if (mode() === 'station') stationView();
else if (mode() === 'practice') stationView(true);
else homeView();
