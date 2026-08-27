import './style.css';
import Peer from 'peerjs';
import QRCode from 'qrcode';
import { opticalInteraction } from './optics.js';

const app = document.querySelector('#app');
const ROWS = 8;
const COLS = 8;
const BOARD_VERSION = '8x8-reference-v3';
const DIRS = [
  { dr: -1, dc: 0, name: 'N' },
  { dr: 0, dc: 1, name: 'E' },
  { dr: 1, dc: 0, name: 'S' },
  { dr: 0, dc: -1, name: 'W' },
];
const DIR_LABELS = ['위', '오른쪽', '아래', '왼쪽'];
const PIECE_NAMES = { laser: '레이저', splitter: '스플리터', king: '왕', triangle: '세모기사', square: '네모기사' };
const PIECE_HELP = {
  laser: { title: '레이저', summary: '이동할 수 없으며 방향만 바꿀 수 있습니다.', detail: '내 턴의 이동 또는 회전이 끝나면 자동으로 발사됩니다. 말 안쪽의 화살표가 현재 발사 방향을 나타내며, 레이저에 맞아도 제거되지 않습니다.' },
  splitter: { title: '스플리터', summary: '빛을 직진시키면서 한 갈래를 더 만듭니다.', detail: '레이저는 굵은 대각선 라인을 그대로 통과하고, 동시에 대각선 면을 따라 90도 꺾인 반사 광선이 추가됩니다. 피격되어도 제거되지 않습니다.' },
  king: { title: '왕', summary: '반드시 보호해야 하는 핵심 말입니다.', detail: '어느 방향에서든 레이저에 맞으면 즉시 제거되고 게임이 끝납니다. 상대 왕을 먼저 제거한 플레이어가 승리합니다.' },
  triangle: { title: '세모기사', summary: '대각선 경계가 거울 역할을 합니다.', detail: '대각선 거울면으로 들어온 레이저는 바깥쪽으로 90도 반사됩니다. 거울이 없는 면에 맞으면 세모기사가 제거됩니다.' },
  square: { title: '네모기사', summary: '색상 라인이 있는 한 면만 거울입니다.', detail: '색상 거울면에 맞은 레이저는 진행해 온 경로로 180도 되돌아갑니다. 나머지 세 면에 맞으면 네모기사가 제거됩니다.' }
};
const ui = { toastTimer: null, guideSlide: 0, matchSelection: { blueId: '', redId: '' }, intro: null, pieceHelpSide: 'blue' };
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
let navigationTimer = null;
const navigate = params => {
  clearTimeout(navigationTimer);
  navigationTimer = setTimeout(() => { location.href = `${location.pathname}?${params}`; }, 130);
};
const createRoomCode = () => String(Math.floor(1000 + Math.random() * 9000));
const setScreen = screen => { document.body.dataset.screen = screen; renderBgmDock(); };

function toast(message, tone = 'info') {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  document.body.appendChild(el);
  if (tone === 'error') sfx.play('error', .7);
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.remove(), 2800);
}

const SFX_FILES = {
  click: 'ui-click.wav', confirm: 'ui-confirm.wav', error: 'ui-error.wav',
  select: 'piece-select.wav', move: 'piece-move.wav', rotate: 'piece-rotate.wav',
  start: 'game-start.wav', laser: 'laser-fire.wav', reflect: 'laser-reflect.wav',
  splitter: 'splitter.wav', destroy: 'piece-destroy.wav', king: 'king-hit.wav',
  victory: 'victory.wav', sent: 'result-sent.wav'
};
const sfx = {
  enabled: true,
  volume: .68,
  play(name, volume = 1) {
    if (!this.enabled || !SFX_FILES[name]) return;
    const audio = new Audio(`/audio/${SFX_FILES[name]}`);
    audio.volume = Math.min(1, this.volume * volume);
    audio.play().catch(() => {});
  }
};
const hostBgm = new Audio('/audio/host-bgm.mp3');
hostBgm.loop = true;
hostBgm.volume = Number(localStorage.getItem('laser-bgm-volume') || .22);
async function setHostBgm(playing, notifyMissing = false) {
  if (!playing) { hostBgm.pause(); sessionStorage.setItem('laser-bgm-playing', '0'); renderBgmDock(); return; }
  try { await hostBgm.play(); sessionStorage.setItem('laser-bgm-playing', '1'); }
  catch { sessionStorage.setItem('laser-bgm-playing', '0'); if (notifyMissing) toast('public/audio/host-bgm.mp3 파일을 추가해주세요.', 'error'); }
  renderBgmDock();
}
const CONFIRM_BUTTON_ACTIONS = new Set(['confirm-host-home', 'confirm-end-session', 'confirm-abort-game']);
function playButtonFeedback(button) {
  if (!button || button.disabled) return;
  const action = button.dataset.action || '';
  sfx.play(CONFIRM_BUTTON_ACTIONS.has(action) ? 'confirm' : 'click', .82);
}
document.addEventListener('pointerdown', e => playButtonFeedback(e.target.closest('button')));
document.addEventListener('keydown', e => {
  if (!e.repeat && (e.key === 'Enter' || e.key === ' ') && e.target.matches('button')) playButtonFeedback(e.target);
});

function renderBgmDock() {
  document.querySelector('.bgm-dock')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<aside class="bgm-dock" aria-label="배경음악 제어">
    <button class="bgm-play-button" data-action="toggle-bgm" aria-label="${hostBgm.paused ? '배경음악 재생' : '배경음악 일시정지'}">${hostBgm.paused ? '▶' : 'Ⅱ'}</button>
    <b>BGM</b>
    <input id="bgm-volume" type="range" min="0" max="1" step="0.05" value="${hostBgm.volume}" aria-label="BGM 음량">
  </aside>`);
}

function header(title, subtitle = '', actions = '') {
  return `<header class="topbar"><div class="brand-mark">LZ</div><div><p class="eyebrow">더 지니어스 한 학급 놀이</p><h1>${safe(title)}</h1>${subtitle ? `<p class="subtitle">${safe(subtitle)}</p>` : ''}</div><div class="topbar-actions">${actions}<button class="icon-btn" data-action="home" aria-label="메인 화면">⌂</button></div></header>`;
}

function homeView() {
  setScreen('home');
  app.innerHTML = `<main class="home shell">
    <section class="hero-panel">
      <p class="eyebrow">더 지니어스 한 학급 놀이</p>
      <h1>레이저 장기</h1>
      <p class="curriculum-copy">5학년 1학기 과학 빛의 성질 / 4학년 수학 평면도형의 이동과 연계<br>문제해결, 전략 수립, 학급 놀이 활동</p>
      <div class="hero-actions">
        <button class="primary large" data-action="open-host">교사 운영 페이지</button>
        <button class="secondary large" data-action="open-station">학생 경기장 접속</button>
        <button class="secondary large guide-button" data-action="open-guide">게임 설명서</button>
      </div>
      <button class="text-btn" data-action="practice">연결 없이 연습 경기</button>
    </section>
  </main>`;
}

function newIntroState() {
  return { subject: '', phase: 'select', straight: false, reflection: false, mathDone: new Set() };
}

function introView(reset = false) {
  if (reset || !ui.intro) ui.intro = newIntroState();
  setScreen('intro');
  if (ui.intro.phase === 'lesson') return introLessonView();
  if (ui.intro.phase === 'speech') return introSpeechView();
  app.innerHTML = `<main class="intro-page"><section class="intro-shell">
    <button class="intro-skip" data-action="skip-intro">건너뛰기</button>
    <div class="intro-heading"><p class="kicker">CURRICULUM CHALLENGE</p><h1>어떤 힘으로 레이저 장기에 도전하겠나?</h1><p>두 개의 교과 카드를 선택해 핵심 개념을 확인하세요.</p></div>
    <div class="intro-subject-grid">
      <button class="intro-subject-card science-card" data-action="select-intro-subject" data-subject="science"><span>5학년 1학기 과학</span><strong>빛의 성질</strong><i>빛의 직진과 반사를 확인한다</i></button>
      <button class="intro-subject-card math-card" data-action="select-intro-subject" data-subject="math"><span>4학년 수학</span><strong>평면도형의 이동</strong><i>밀기·뒤집기·돌리기를 실행한다</i></button>
    </div>
  </section></main>`;
}

function introLessonView() {
  setScreen('intro');
  const science = ui.intro.subject === 'science';
  app.innerHTML = `<main class="intro-page"><section class="intro-shell intro-lesson-shell">
    <button class="intro-skip" data-action="skip-intro">건너뛰기</button>
    <div class="intro-flip-stage ${science ? 'science-theme' : 'math-theme'}">
      <p class="kicker">${science ? '5학년 1학기 과학' : '4학년 수학'}</p><h1>${science ? '빛의 성질' : '평면도형의 이동'}</h1>
      ${science ? scienceIntroContent() : mathIntroContent()}
    </div>
    ${science && ui.intro.straight && ui.intro.reflection ? '<button class="intro-next" data-action="intro-to-speech">다음</button>' : !science && ui.intro.mathDone.size === 3 ? '<button class="intro-next" data-action="intro-to-speech">다음</button>' : ''}
  </section></main>`;
}

function scienceIntroContent() {
  return `<div class="science-concept-flow">
    <article class="science-question"><p>빛이 곧게 나아가는 성질을 빛의 <button class="concept-blank ${ui.intro.straight ? 'revealed' : ''}" data-action="reveal-science-concept" data-concept="straight">${ui.intro.straight ? '직진' : '□□'}</button>이라고 한다.</p></article>
    ${ui.intro.straight ? `<div class="concept-connector"><span></span><i>빛은 한 방향으로 곧게 나아간다</i></div><article class="science-question second-question"><p>빛이 거울에 부딪쳐서 나아가는 방향이 바뀌는 성질을 빛의 <button class="concept-blank ${ui.intro.reflection ? 'revealed' : ''}" data-action="reveal-science-concept" data-concept="reflection">${ui.intro.reflection ? '반사' : '□□'}</button>라고 한다.</p></article>` : ''}
  </div>`;
}

function mathIntroContent() {
  const done = action => ui.intro.mathDone.has(action) ? 'done' : '';
  return `<div class="math-concept-lab"><div class="math-piece-stage"><div class="math-grid-lines"></div><img id="intro-math-piece" src="/images/pieces/blue/piece_triangle_blue.png?v=20260822-2" alt="세모기사"><b>세모기사</b></div><div class="math-action-panel"><p>세모기사를 움직여 세 가지 이동을 모두 확인하세요.</p><button class="${done('push')}" data-action="animate-math-piece" data-move="push"><span>↕</span>밀기</button><button class="${done('flip')}" data-action="animate-math-piece" data-move="flip"><span>⇆</span>뒤집기</button><button class="${done('rotate')}" data-action="animate-math-piece" data-move="rotate"><span>↻</span>돌리기</button></div></div>`;
}

function introSpeechView() {
  setScreen('intro');
  const science = ui.intro.subject === 'science';
  const topic = science ? '빛의 성질' : '평면도형의 이동';
  const speechLines = [
    `이제 ${topic}에 대해서`,
    '충분히 이해했나?',
    `그렇다면 ${topic}을`,
    '이용한 레이저 장기로',
    '너의 두뇌와 집중력을 시험해보지..',
    '움하하하~~'
  ];
  app.innerHTML = `<main class="intro-page"><section class="intro-shell intro-speech-shell"><button class="intro-skip" data-action="skip-intro">건너뛰기</button><div class="intro-villain-symbol">◆</div><p class="intro-rising-speech">${speechLines.map((line, index) => `<span style="--speech-delay:${(.35 + index * 1.45).toFixed(2)}s">${line}</span>`).join('')}</p><button class="intro-next intro-speech-next" data-action="finish-intro">다음</button></section></main>`;
}

function animateMathPiece(move) {
  if (!['push', 'flip', 'rotate'].includes(move)) return;
  ui.intro.mathDone.add(move);
  const piece = document.querySelector('#intro-math-piece');
  const button = document.querySelector(`[data-move="${move}"]`);
  if (piece) { piece.classList.remove('animate-push', 'animate-flip', 'animate-rotate'); void piece.offsetWidth; piece.classList.add(`animate-${move}`); }
  button?.classList.add('done');
  if (ui.intro.mathDone.size === 3 && !document.querySelector('.intro-next')) document.querySelector('.intro-lesson-shell')?.insertAdjacentHTML('beforeend', '<button class="intro-next" data-action="intro-to-speech">다음</button>');
}

const GUIDE_SLIDES = [
  {
    kicker: 'GAME OBJECTIVE', title: '빛의 경로를 완성해 왕을 제거하세요',
    body: `<div class="guide-goal-grid"><article><b>게임 목표</b><p>말을 한 칸 이동하거나 90도 회전해 레이저의 경로를 설계합니다.</p></article><article><b>승리 조건</b><p>내 턴이 끝날 때 자동 발사되는 레이저로 상대 왕을 먼저 제거하면 승리합니다.</p></article></div><div class="guide-link-flow"><span>교사 운영 페이지<br><small>명단·경기장·순위 관리</small></span><i>⇄</i><span>학생 경기장<br><small>2인 대전·결과 전송</small></span></div><p class="guide-note">경기 시작·연결 상태·종료 결과만 교사 화면으로 전달되며, 실제 대국은 한 대의 태블릿에서 진행됩니다.</p>`
  },
  {
    kicker: 'PIECE & RULES', title: '다섯 종류의 말을 이해하세요',
    body: `<div class="guide-piece-grid">
      <article><img src="/images/pieces/blue/piece_laser_blue.png?v=20260822-2" alt="레이저"><div><b>레이저</b><p>이동할 수 없고 턴 종료 후 자동 발사됩니다. 피격되어도 제거되지 않습니다.</p></div></article>
      <article><img src="/images/pieces/blue/piece_splitter_blue.png?v=20260822-2" alt="스플리터"><div><b>스플리터</b><p>빛은 그대로 통과하며, 대각선 면을 따라 90도 반사된 빛이 한 갈래 더 생깁니다.</p></div></article>
      <article><img src="/images/pieces/blue/piece_king_blue.png?v=20260822-2" alt="왕"><div><b>왕</b><p>어느 면이든 레이저에 맞으면 즉시 제거되고 게임이 끝납니다.</p></div></article>
      <article><img src="/images/pieces/blue/piece_triangle_blue.png?v=20260822-2" alt="세모기사"><div><b>세모기사</b><p>거울면은 빛을 반사하며, 거울이 없는 면에 맞으면 제거됩니다.</p></div></article>
      <article><img src="/images/pieces/blue/piece_square_blue.png?v=20260822-2" alt="네모기사"><div><b>네모기사</b><p>색상 거울면은 빛을 180도 되돌리며, 나머지 세 면에 맞으면 제거됩니다.</p></div></article>
    </div><p class="guide-note">한 턴에는 내 말 하나를 인접한 8방향으로 한 칸 이동하거나, 내 말 하나를 90도 회전합니다. 레이저는 판 밖을 향하도록 돌릴 수 없습니다.</p>`
  },
  {
    kicker: 'TEACHER SETUP', title: '교사 운영 페이지 실행 순서',
    body: `<ol class="guide-steps"><li><b>이름 입력</b><span>게임 이름과 학생 이름을 줄바꿈으로 입력합니다.</span></li><li><b>플레이어 등록</b><span>버튼을 눌러 명단을 확정하고, 하단에 표시된 확정 명단을 확인합니다.</span></li><li><b>게임 시작</b><span>확정 명단 아래의 게임 시작 버튼을 눌러 학생 경기장 접속을 활성화합니다.</span></li><li><b>학생 경기장 접속</b><span>태블릿에서 QR을 스캔하거나 메인 화면에서 4자리 코드를 입력한 뒤 경기장 번호를 지정합니다.</span></li><li><b>선수 선택과 결과 확인</b><span>학생 두 명이 이름 카드를 선택해 대국하고, 종료 결과는 순위와 최근 경기에 반영됩니다.</span></li><li><b>게임 종료·결과 공개</b><span>완료된 경기만 반영한 최종 순위를 공개하고 결과표를 복사합니다.</span></li></ol>`
  },
  {
    kicker: 'MORE INFORMATION', title: '영상으로 규칙을 확인할 수 있어요',
    body: `<div class="youtube-guide"><div class="youtube-mark">▶</div><p>유튜브 검색창에서 아래 문구를 검색하면<br>레이저 장기의 실제 진행과 규칙 영상을 찾아볼 수 있습니다.</p><strong>지니어스 게임 레이저 장기 게임 규칙</strong><small>영상은 수업 전에 교사가 먼저 확인한 뒤 필요한 부분만 활용해 주세요.</small></div>`
  }
];

function showGuideModal(slide = ui.guideSlide) {
  ui.guideSlide = Math.max(0, Math.min(GUIDE_SLIDES.length - 1, slide));
  document.querySelector('.guide-modal-overlay')?.remove();
  const current = GUIDE_SLIDES[ui.guideSlide];
  document.body.insertAdjacentHTML('beforeend', `<div class="guide-modal-overlay" role="presentation"><section class="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
    <button class="guide-close" data-action="close-guide" aria-label="설명서 닫기">×</button>
    <div class="guide-progress"><span>${ui.guideSlide + 1}</span> / ${GUIDE_SLIDES.length}</div>
    <p class="kicker">${current.kicker}</p><h2 id="guide-title">${current.title}</h2>
    <div class="guide-slide-body">${current.body}</div>
    <div class="guide-footer"><div class="guide-dots">${GUIDE_SLIDES.map((_, index) => `<button class="guide-dot ${index === ui.guideSlide ? 'active' : ''}" data-action="guide-jump" data-slide="${index}" aria-label="${index + 1}번째 설명"></button>`).join('')}</div><div class="guide-nav"><button class="secondary" data-action="guide-prev" ${ui.guideSlide === 0 ? 'disabled' : ''}>이전</button><button class="primary" data-action="${ui.guideSlide === GUIDE_SLIDES.length - 1 ? 'close-guide' : 'guide-next'}">${ui.guideSlide === GUIDE_SLIDES.length - 1 ? '설명서 닫기' : '다음'}</button></div></div>
  </section></div>`);
}

function hostState() {
  const cached = sessionStorage.getItem('laser-host');
  if (cached) {
    const parsed = JSON.parse(cached);
    if (!/^\d{4}$/.test(parsed.room || '')) parsed.room = createRoomCode();
    if (typeof parsed.rosterConfirmed !== 'boolean') parsed.rosterConfirmed = Boolean(parsed.players?.length && parsed.started);
    return parsed;
  }
  return {
    room: createRoomCode(),
    title: '우리 반 레이저 장기', players: [], stations: {}, matches: [], active: {},
    rosterConfirmed: false, started: false, ended: false, createdAt: now()
  };
}
let host = null;
function saveHost() {
  if (host) sessionStorage.setItem('laser-host', JSON.stringify(host));
}

function hostView() {
  setScreen('host');
  host = hostState();
  saveHost();
  const gameStartControl = host.rosterConfirmed && !host.started && !host.ended ? '<button class="host-game-start-button" data-action="start-operation"><span>▶</span><b>게임 시작</b><small>학생 경기장 접속을 활성화합니다</small></button>' : host.started && !host.ended ? '<div class="host-game-running"><span></span>게임이 운영 중입니다</div>' : '';
  const confirmedRoster = host.rosterConfirmed && host.players.length ? `<section class="confirmed-roster"><div><b>확정된 플레이어</b><span>${host.players.length}명</span></div><ul>${host.players.map((player, index) => `<li><i>${index + 1}</i>${safe(player.name)}</li>`).join('')}</ul>${gameStartControl}</section>` : '<section class="confirmed-roster empty-roster"><p>플레이어 등록을 완료하면 확정된 명단이 여기에 표시됩니다.</p></section>';
  app.innerHTML = `${header('레이저 장기 관제실', '모든 데이터는 이 탭에만 임시 저장됩니다.')}
  <main class="host-layout shell wide">
    <section class="panel setup-panel">
      <div class="section-head"><div><p class="kicker">PLAYER REGISTRATION</p><h2>게임 운영</h2></div><span class="live-pill ${host.started && !host.ended ? 'on' : ''}">${host.ended ? '결과 공개' : host.started ? '운영 중' : host.rosterConfirmed ? '명단 확정' : '등록 전'}</span></div>
      <label>게임 이름<input id="room-title" value="${safe(host.title)}" ${host.rosterConfirmed ? 'disabled' : ''}></label>
      <label>플레이어 등록 <span class="hint">줄바꿈 또는 쉼표로 구분</span>
        <textarea id="roster" rows="10" ${host.rosterConfirmed ? 'disabled' : ''} placeholder="홍길동&#10;임꺽정&#10;심청이">${safe(host.players.map(p => p.name).join('\n'))}</textarea>
      </label>
      <div class="button-row">
        ${!host.rosterConfirmed ? '<button class="primary" data-action="confirm-roster">플레이어 등록</button>' : '<button class="secondary" disabled>플레이어 등록 완료</button>'}
        ${host.ended ? '<button class="secondary" data-action="new-session">새 게임방</button>' : ''}
      </div>
      ${confirmedRoster}
      <p class="privacy-note">경기 결과는 이 운영 탭에만 임시로 보관됩니다.</p>
    </section>
    <section class="panel connection-panel">
      <div class="section-head"><div><p class="kicker">STUDENT ACCESS</p><h2>경기장 접속</h2></div><b class="room-code">${host.room}</b></div>
      <div class="qr-wrap"><button class="qr-trigger" data-action="open-qr-modal" aria-label="학생 경기장 QR코드 크게 보기"><canvas id="qr"></canvas><span>클릭하여 크게 보기</span></button><div><p>학생 태블릿에서 QR을 스캔하세요.</p><button class="secondary small" data-action="copy-link">링크 복사</button></div></div>
      <div class="connection-status" id="peer-status"><span></span> 연결 준비 중</div>
    </section>
    <section class="panel stations-panel"><div class="section-head"><div><p class="kicker">LIVE ARENAS</p><h2>경기장 현황</h2></div><strong>${Object.keys(host.stations).length}대 연결</strong></div><div id="station-grid"></div></section>
    <section class="panel scoreboard-panel"><div class="section-head"><div><p class="kicker">LIVE SCOREBOARD</p><h2>실시간 순위</h2></div><button class="secondary small" data-action="fullscreen-board">전광판 크게 보기</button></div><div id="ranking"></div></section>
    <section class="panel results-panel"><div class="section-head"><div><p class="kicker">MATCH FEED</p><h2>최근 경기 결과</h2></div><span>${host.matches.length}경기 완료</span></div><div id="match-feed"></div></section>
    <section class="panel export-panel"><div class="export-copy"><h2>게임 종료</h2><p>게임 종료(결과 공개) 버튼을 클릭하시면 지금 운영 중인 게임이 모두 종료됩니다.<br>게임 종료 버튼 클릭 시 진행 중인 게임 결과는 순위에 반영되지 않습니다.<br><strong>결과 공개 페이지에서 게임 결과 내용을 복사하실 수 있습니다.</strong></p></div><div class="button-row"><button class="danger end-reveal-button" data-action="open-end-session-modal" ${!host.started || host.ended ? 'disabled' : ''}>게임 종료(결과 공개)</button></div></section>
  </main>`;
  renderHostDynamic();
  const studentUrl = `${location.origin}${location.pathname}?mode=station&room=${host.room}`;
  QRCode.toCanvas(document.querySelector('#qr'), studentUrl, { width: 160, margin: 1, color: { dark: '#07111fff', light: '#f4ead4ff' } });
  if (host.started && !host.ended) startHostPeer();
  if (sessionStorage.getItem('laser-bgm-playing') === '1' && host.started && !host.ended) setHostBgm(true);
}

function studentAccessUrl() {
  return `${location.origin}${location.pathname}?mode=station&room=${host.room}`;
}

function showQrModal() {
  document.querySelector('.qr-modal-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="qr-modal-overlay" role="presentation"><section class="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title"><button class="guide-close" data-action="close-qr-modal" aria-label="QR코드 닫기">×</button><p class="kicker">STUDENT ACCESS</p><h2 id="qr-modal-title">학생 경기장 접속</h2><b class="qr-modal-code">${host.room}</b><div class="qr-large-frame"><canvas id="qr-large"></canvas></div><p>학생 태블릿 카메라로 QR코드를 스캔하세요.</p><button class="primary large" data-action="copy-link">링크 복사</button></section></div>`);
  QRCode.toCanvas(document.querySelector('#qr-large'), studentAccessUrl(), { width: 360, margin: 2, color: { dark: '#07111fff', light: '#fffaf0ff' } });
}

function standings() {
  if (!host) return [];
  const stats = Object.fromEntries(host.players.map(p => [p.id, { ...p, games: 0, wins: 0, losses: 0, points: 0, currentStreak: 0, bestStreak: 0, totalTurns: 0, totalDurationMs: 0 }]));
  host.matches.filter(m => !m.void).sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0)).forEach(m => {
    const winner = stats[m.winnerId], loser = stats[m.loserId];
    if (winner) {
      winner.games++; winner.wins++; winner.points += 3; winner.currentStreak++;
      winner.bestStreak = Math.max(winner.bestStreak, winner.currentStreak);
      winner.totalTurns += m.turnCount || 0; winner.totalDurationMs += m.durationMs || 0;
    }
    if (loser) {
      loser.games++; loser.losses++; loser.currentStreak = 0;
      loser.totalTurns += m.turnCount || 0; loser.totalDurationMs += m.durationMs || 0;
    }
  });
  return Object.values(stats).map(player => ({
    ...player,
    winRate: player.games ? Math.round((player.wins / player.games) * 100) : 0,
    averageTurns: player.games ? Math.round(player.totalTurns / player.games) : 0,
    averageDurationMs: player.games ? Math.round(player.totalDurationMs / player.games) : 0
  })).sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
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
  const stats = Object.fromEntries(standings().map(p => [p.id, { games: p.games, wins: p.wins, losses: p.losses, points: p.points, winRate: p.winRate }]));
  const data = { type: 'ROSTER', players: host.players, stats, sessionTitle: host.title, ended: host.ended };
  hostConnections.forEach(conn => { if (conn.open) conn.send(data); });
}

function startHostPeer() {
  if (peer && !peer.destroyed) return;
  peer = new Peer(`laser-${host.room.toLowerCase()}`);
  const status = document.querySelector('#peer-status');
  peer.on('open', () => { if (status) status.innerHTML = '<span class="ok"></span> 학생 접속 가능'; });
  peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      host.room = createRoomCode(); saveHost(); peer?.destroy(); peer = null; hostView();
      return toast('코드가 겹쳐 새 4자리 코드로 자동 변경했습니다.', 'error');
    }
    if (status) status.innerHTML = `<span class="bad"></span> 연결 오류: ${safe(err.type)}`;
  });
  peer.on('connection', conn => {
    conn.on('open', () => {
      hostConnections.set(conn.peer, conn);
      const stats = Object.fromEntries(standings().map(p => [p.id, { games: p.games, wins: p.wins, losses: p.losses, points: p.points, winRate: p.winRate }]));
      conn.send({ type: 'WELCOME', players: host.players, stats, sessionTitle: host.title, ended: host.ended });
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
    const stats = Object.fromEntries(standings().map(p => [p.id, { games: p.games, wins: p.wins, losses: p.losses, points: p.points, winRate: p.winRate }]));
    conn.send({ type: 'ROSTER', players: host.players, stats, sessionTitle: host.title, ended: host.ended });
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
    const result = { ...active, winnerId, loserId, winnerName: winnerId === active.blueId ? active.blueName : active.redName, loserName: winnerId === active.blueId ? active.redName : active.blueName, endedAt: now(), durationMs: data.durationMs, turnCount: data.turnCount, reason: data.reason || 'king_destroyed', processLog: Array.isArray(data.processLog) ? data.processLog : [] };
    host.matches.push(result);
    delete host.active[data.matchId];
    Object.assign(host.stations[data.stationId], { status: 'ready', activeMatchId: null, lastSeen: now() });
    saveHost(); renderHostDynamic(); broadcastRoster();
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
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed.boardVersion !== BOARD_VERSION) { parsed.game = null; parsed.match = null; parsed.status = parsed.number ? 'ready' : 'setup'; }
    return { ...parsed, boardVersion: BOARD_VERSION, stats: parsed.stats || {} };
  }
  return { stationId: uid('station'), number: '', status: 'setup', players: [], stats: {}, match: null, game: null, boardVersion: BOARD_VERSION };
}
let station = null;
function saveStation() { if (station) localStorage.setItem(`laser-station-${roomCode() || 'practice'}`, JSON.stringify(station)); }

function stationView(practice = false) {
  station = stationState();
  if (practice) {
    station.number = '연습'; station.status = station.game ? 'playing' : 'ready';
    station.players = [{ id: 'practice-blue', name: '청색 플레이어' }, { id: 'practice-red', name: '적색 플레이어' }];
    station.stats = { 'practice-blue': { wins: 0, losses: 0, points: 0 }, 'practice-red': { wins: 0, losses: 0, points: 0 } };
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
  setScreen('station');
  app.innerHTML = `${header('학생 경기장 접속')}<main class="center shell"><section class="panel join-card"><p class="kicker">ENTER ARENA</p><h2>4자리 경기장 코드를 입력하세요</h2><input id="join-code" class="code-input" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="4827" autocomplete="off"><button class="primary large" data-action="join-room">경기장 접속</button></section></main>`;
}

function stationRegisterView() {
  setScreen('station');
  app.innerHTML = `${header('경기장 등록', `방 코드 ${roomCode()}`)}<main class="center shell"><section class="panel join-card"><p class="kicker">ARENA NUMBER</p><h2>이 태블릿의 경기장 번호</h2><div class="number-grid">${Array.from({ length: 13 }, (_, i) => `<button class="number-btn" data-action="set-station" data-number="${i + 1}">${i + 1}</button>`).join('')}</div><p class="hint">태블릿마다 서로 다른 번호를 선택하세요.</p></section></main>`;
}

function stationLobbyView() {
  setScreen('station');
  const selectedBlue = station.players.find(player => player.id === ui.matchSelection.blueId);
  const selectedRed = station.players.find(player => player.id === ui.matchSelection.redId);
  const playerCards = station.players.map(player => {
    const side = player.id === ui.matchSelection.blueId ? 'blue' : player.id === ui.matchSelection.redId ? 'red' : '';
    const stats = station.stats?.[player.id] || { wins: 0, losses: 0, points: 0 };
    return `<button class="player-card ${side ? `selected-${side}` : ''}" data-action="select-player" data-player-id="${safe(player.id)}"><strong>${safe(player.name)}</strong><small>${stats.wins || 0}승 ${stats.losses || 0}패 · ${stats.points || 0}점</small>${side ? `<span>${side === 'blue' ? '청색' : '적색'}</span>` : ''}</button>`;
  }).join('');
  app.innerHTML = `${header(`${safe(station.number)}번 경기장`, `방 코드 ${roomCode()}`)}<main class="station-shell shell">
    <section class="panel player-select"><div class="connection-status" id="station-peer">${stationConnection?.open ? '<span class="ok"></span> 교사 화면 연결됨' : '<span></span> 교사 화면 연결 중'}</div><p class="kicker">PLAYER MATCHING</p><h2>도전자 두 명을 선택하세요</h2>
      <div class="player-slots"><article class="blue-slot"><span>청색 플레이어</span><strong>${selectedBlue ? safe(selectedBlue.name) : '이름 카드를 선택하세요'}</strong>${selectedBlue ? '<button data-action="clear-player" data-side="blue" aria-label="청색 선택 해제">×</button>' : ''}</article><b>VS</b><article class="red-slot"><span>적색 플레이어</span><strong>${selectedRed ? safe(selectedRed.name) : '이름 카드를 선택하세요'}</strong>${selectedRed ? '<button data-action="clear-player" data-side="red" aria-label="적색 선택 해제">×</button>' : ''}</article></div>
      <p class="selection-guide">이름을 차례로 누르면 청색, 적색 순서로 배정됩니다.</p><div class="player-card-grid">${playerCards || '<p class="empty">등록된 플레이어가 없습니다.</p>'}</div>
      <button class="primary large match-start-button" data-action="request-match" ${stationConnection?.open && selectedBlue && selectedRed ? '' : 'disabled'}>두 선수 확인 · 경기 시작</button>
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
      if (station.pendingAbort) {
        stationConnection.send(station.pendingAbort);
        delete station.pendingAbort;
        saveStation();
      }
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
    station.stats = data.stats || station.stats || {};
    if (data.ended) {
      clearInterval(heartbeatTimer);
      station.game = null; station.match = null; station.status = 'ended'; saveStation();
      return stationSessionEndedView();
    }
    saveStation();
    if (!station.game) stationLobbyView();
  }
  if (data.type === 'MATCH_START_REJECTED') toast(data.reason, 'error');
  if (data.type === 'MATCH_START_APPROVED') { station.match = data.match; startLocalGame(data.match); }
  if (data.type === 'RESULT_ACCEPTED') {
    station.game = null; station.match = null; station.status = 'ready'; ui.matchSelection = { blueId: '', redId: '' }; saveStation();
    sfx.play('sent', .85);
    resultAcceptedView();
  }
  if (data.type === 'RESULT_REJECTED') toast(data.reason, 'error');
  if (data.type === 'SESSION_ENDED') {
    clearInterval(heartbeatTimer);
    station.game = null; station.match = null; station.status = 'ended'; ui.matchSelection = { blueId: '', redId: '' }; saveStation();
    stationSessionEndedView();
  }
}

function initialPieces() {
  const P = (id, owner, type, r, c, dir) => ({ id, owner, type, r, c, dir, alive: true });
  // 사용자 제공 8×8 기준 이미지의 좌표와 방향을 그대로 옮긴 배치.
  // 적색은 이미지의 밝은색 진영, 청색은 이미지의 어두운색 진영에 대응한다.
  return [
    P('r-sp','red','splitter',0,0,0), P('r-t1','red','triangle',0,3,1), P('r-l','red','laser',0,7,3),
    P('r-s1','red','square',2,7,3), P('r-t2','red','triangle',3,4,3), P('r-k','red','king',3,7,3),
    P('r-t3','red','triangle',4,4,2), P('r-s2','red','square',4,7,3), P('r-t4','red','triangle',5,7,2), P('r-t5','red','triangle',6,0,1),
    P('b-t1','blue','triangle',1,7,1), P('b-t2','blue','triangle',2,0,2), P('b-s1','blue','square',3,0,1),
    P('b-t3','blue','triangle',3,3,2), P('b-k','blue','king',4,0,1), P('b-t4','blue','triangle',4,3,3),
    P('b-s2','blue','square',5,0,1), P('b-l','blue','laser',7,0,1), P('b-t5','blue','triangle',7,4,1), P('b-sp','blue','splitter',7,7,0)
  ];
}

function startLocalGame(match, practice = false) {
  station.match = match;
  station.status = 'playing';
  station.boardVersion = BOARD_VERSION;
  station.game = { pieces: initialPieces(), turn: 'blue', turnCount: 0, selectedId: null, startedAt: match.startedAt || now(), beams: [], processLog: [], message: '청색 플레이어의 차례입니다.', over: false, practice };
  saveStation(); sendHeartbeat(); sfx.play('start', .8); gameView(practice);
}

function pieceAsset(p) { return `/images/pieces/${p.owner}/piece_${p.type}_${p.owner}.png?v=20260822-2`; }
function pieceAt(r, c) { return station.game.pieces.find(p => p.alive && p.r === r && p.c === c); }
function playerHud(owner, name) {
  const g = station.game;
  const active = !g.over && g.turn === owner;
  const sideName = owner === 'blue' ? '청색' : '적색';
  return `<header class="game-hud ${owner}-hud ${active ? 'active-side' : ''}">
    <button class="rotate-key rotate-left-key" data-action="rotate-left" data-side="${owner}" ${active ? '' : 'disabled'} aria-label="${sideName} 왼쪽 회전"><b>↶</b><span>왼쪽 회전</span></button>
    <div class="hud-player"><span>${sideName}</span><strong>${safe(name)}</strong><div class="turn-signal ${active ? 'active' : ''}">${active ? '현재 차례' : '대기'}</div></div>
    <button class="rotate-key rotate-right-key" data-action="rotate-right" data-side="${owner}" ${active ? '' : 'disabled'} aria-label="${sideName} 오른쪽 회전"><span>오른쪽 회전</span><b>↷</b></button>
  </header>`;
}

function playerInfoPanel(owner) {
  const g = station.game;
  const playerId = owner === 'blue' ? station.match.blueId : station.match.redId;
  const stats = station.stats?.[playerId] || { wins: 0, losses: 0, points: 0 };
  const deadPieces = g.pieces.filter(piece => piece.owner === owner && !piece.alive);
  const helpIcons = Object.keys(PIECE_HELP).map(type => `<button class="piece-help-icon" data-action="show-piece-help" data-piece="${type}" data-side="${owner}" aria-label="${PIECE_NAMES[type]} 설명"><img src="/images/pieces/${owner}/piece_${type}_${owner}.png?v=20260822-2" alt=""><span>${PIECE_NAMES[type]}</span></button>`).join('');
  return `<aside class="player-info-panel ${owner}-info-panel">
    <section class="info-block timer-block"><span>게임 시간</span><strong class="game-clock">${fmtTime(now() - g.startedAt)}</strong></section>
    <section class="info-block record-block"><span>현재 내 게임 전적</span><div><b>${stats.wins || 0}승</b><b>${stats.losses || 0}패</b><b>${stats.points || 0}점</b></div></section>
    <section class="info-block piece-help-block"><span>장기말 기능 보기</span><div class="piece-help-grid">${helpIcons}</div><p>아이콘을 누르면 기능을 확인할 수 있습니다.</p></section>
    <section class="info-block captured-block"><span>제거된 내 말</span><div class="captured-pieces">${deadPieces.length ? deadPieces.map(piece => `<img src="${pieceAsset(piece)}" alt="제거된 ${PIECE_NAMES[piece.type]}" title="${PIECE_NAMES[piece.type]}">`).join('') : '<p class="info-empty">아직 제거된 말이 없습니다.</p>'}</div></section>
    <button class="game-abort-button" data-action="open-abort-game-modal" data-side="${owner}">게임 종료</button>
    ${g.practice ? '<button class="practice-home-button" data-action="home">⌂ 메인화면</button>' : ''}
  </aside>`;
}

function showPieceHelpModal(type, side = 'blue') {
  const help = PIECE_HELP[type]; if (!help) return;
  ui.pieceHelpSide = side;
  document.querySelector('.game-help-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="game-help-overlay"><section class="piece-help-modal ${side === 'red' ? 'red-facing-modal' : ''}" role="dialog" aria-modal="true"><button class="guide-close" data-action="close-game-help" aria-label="설명 닫기">×</button><img src="/images/pieces/${side}/piece_${type}_${side}.png?v=20260822-2" alt="${help.title}"><p class="kicker">PIECE GUIDE</p><h2>${help.title}</h2><strong>${help.summary}</strong><p>${help.detail}</p><button class="primary" data-action="close-game-help">확인</button></section></div>`);
}

function showAbortGameModal(side = 'blue') {
  document.querySelector('.game-help-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="game-help-overlay"><section class="game-abort-modal ${side === 'red' ? 'red-facing-modal' : ''}" role="dialog" aria-modal="true"><div class="modal-symbol">!</div><p class="kicker">ABORT MATCH</p><h2>현재 게임을 종료할까요?</h2><div class="abort-warning">현재 게임은 전적과 최종 순위에 포함되지 않습니다.</div><p>두 플레이어의 현재 진행 상황은 삭제되며 되돌릴 수 없습니다.</p><div class="button-row"><button class="secondary" data-action="close-game-help">게임 계속하기</button><button class="danger" data-action="confirm-abort-game">게임 종료</button></div></section></div>`);
}

function abortCurrentGame() {
  const match = station.match;
  const practice = Boolean(station.game?.practice);
  document.querySelector('.game-help-overlay')?.remove();
  if (practice) {
    station.game = null;
    station.match = null;
    station.status = 'ready';
    saveStation();
    navigate('');
    return;
  }
  const abortData = { type: 'MATCH_ABORT', stationId: station.stationId, matchId: match?.matchId };
  if (stationConnection?.open) stationConnection.send(abortData);
  else station.pendingAbort = abortData;
  station.game = null;
  station.match = null;
  station.status = 'ready';
  ui.matchSelection = { blueId: '', redId: '' };
  saveStation();
  stationLobbyView();
  connectStation();
}

function gameView(practice = station.game?.practice) {
  const g = station.game;
  if (!g) return stationLobbyView();
  g.processLog ||= [];
  setScreen(g.over ? 'result' : 'game');
  const blue = station.match.blueName, red = station.match.redName;
  app.innerHTML = `<main class="game-screen">
    ${playerHud('red', red)}
    <section class="game-body">
      ${playerInfoPanel('red')}
      <section class="board-stage">
        <div class="arena-caption practice-blue-caption">${g.practice ? '연습 경기' : ''}</div>
        <div class="board-wrap"><div id="board" class="board"></div><svg id="laser-layer" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="none"></svg></div>
        <div class="arena-caption practice-red-caption">${g.practice ? '연습 경기' : ''}</div>
      </section>
      ${playerInfoPanel('blue')}
    </section>
    ${playerHud('blue', blue)}
    ${g.over ? resultOverlay() : ''}
  </main>`;
  renderBoard();
  const tick = setInterval(() => { const clocks = document.querySelectorAll('.game-clock'); if (!clocks.length || station.game !== g) return clearInterval(tick); clocks.forEach(clock => { clock.textContent = fmtTime(now() - g.startedAt); }); }, 1000);
}

function renderBoard() {
  const g = station.game;
  const board = document.querySelector('#board'); if (!board) return;
  const selectedPiece = g.pieces.find(piece => piece.id === g.selectedId && piece.alive);
  board.innerHTML = Array.from({ length: ROWS * COLS }, (_, idx) => {
    const r = Math.floor(idx / COLS), c = idx % COLS, p = pieceAt(r, c);
    const selected = p?.id === g.selectedId;
    const moveTarget = selectedPiece && selectedPiece.type !== 'laser' && !p && Math.max(Math.abs(selectedPiece.r - r), Math.abs(selectedPiece.c - c)) === 1;
    return `<button class="cell ${(r + c) % 2 ? 'odd' : ''} ${selected ? 'selected' : ''} ${moveTarget ? 'move-target' : ''}" data-r="${r}" data-c="${c}" aria-label="${p ? `${p.owner === 'blue' ? '청색' : '적색'} ${PIECE_NAMES[p.type]}` : moveTarget ? '이동 가능한 칸' : '빈 칸'}">${p ? `<span class="piece ${p.owner} ${p.type}" style="--dir:${p.dir * 90}deg"><img src="${pieceAsset(p)}" alt="" draggable="false">${p.type === 'laser' ? '<span class="laser-direction-arrow" aria-hidden="true"></span>' : ''}</span>` : moveTarget ? '<span class="move-guide-dot" aria-hidden="true"></span>' : ''}</button>`;
  }).join('');
}

function handleCell(r, c) {
  const g = station.game; if (!g || g.over) return;
  const p = pieceAt(r, c);
  const selected = g.pieces.find(x => x.id === g.selectedId);
  if (!selected) {
    if (!p || p.owner !== g.turn) return toast('현재 차례의 말을 선택하세요.', 'error');
    g.selectedId = p.id; g.message = `${PIECE_NAMES[p.type]} 선택 · 이동할 칸을 누르거나 회전하세요.`; sfx.play('select', .65); saveStation(); renderBoard(); return;
  }
  if (p?.owner === g.turn) { g.selectedId = p.id; renderBoard(); return; }
  if (selected.type === 'laser') return toast('레이저는 이동할 수 없습니다. 방향만 바꿀 수 있습니다.', 'error');
  if (p) return toast('다른 말이 있는 칸으로 이동할 수 없습니다.', 'error');
  if (Math.max(Math.abs(selected.r - r), Math.abs(selected.c - c)) !== 1) return toast('상하좌우 또는 대각선으로 한 칸만 이동할 수 있습니다.', 'error');
  const action = `${PIECE_NAMES[selected.type]} ${selected.r + 1}행 ${selected.c + 1}열 → ${r + 1}행 ${c + 1}열 이동`;
  selected.r = r; selected.c = c; sfx.play('move'); completeAction(action);
}

function rotateSelected(delta, requestedSide = '') {
  const g = station.game; if (!g || g.over) return;
  if (requestedSide && requestedSide !== g.turn) return toast('현재 차례의 조작 버튼을 사용하세요.', 'error');
  const p = g.pieces.find(x => x.id === g.selectedId);
  if (!p) return toast('회전할 말을 먼저 선택하세요.', 'error');
  const previous = p.dir;
  const next = (p.dir + delta + 4) % 4;
  if (p.type === 'laser') {
    const nr = p.r + DIRS[next].dr, nc = p.c + DIRS[next].dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return toast('레이저를 게임판 바깥쪽으로 돌릴 수 없습니다.', 'error');
  }
  p.dir = next; sfx.play('rotate'); completeAction(`${PIECE_NAMES[p.type]} ${delta < 0 ? '왼쪽' : '오른쪽'} 90도 회전 (${DIR_LABELS[previous]} → ${DIR_LABELS[next]})`);
}

function completeAction(action) {
  const g = station.game;
  g.selectedId = null; g.turnCount += 1;
  g.processLog ||= [];
  g.processLog.push({ turn: g.turnCount, side: g.turn, playerName: g.turn === 'blue' ? station.match.blueName : station.match.redName, action, laserResult: '', elapsedMs: now() - g.startedAt });
  g.message = '레이저 발사!'; saveStation(); gameView();
  setTimeout(() => fireLaser(g.turn), 180);
}

function traceRay(r, c, dir, segments, hits, beamFx, visited, depth = 0) {
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
      const interaction = opticalInteraction(hit.type, hit.dir, cd);
      beamFx.push('splitter');
      interaction.reflected.forEach(reflected => traceRay(cr, cc, reflected, segments, hits, beamFx, new Set(visited), depth + 1));
      continue;
    }
    const interaction = opticalInteraction(hit.type, hit.dir, cd);
    if (interaction.destroy || !interaction.reflected.length) { hits.push(hit); return; }
    beamFx.push('reflect');
    cd = interaction.reflected[0];
  }
}

function fireLaser(owner) {
  const g = station.game; if (!g || g.over) return;
  const laser = g.pieces.find(p => p.alive && p.owner === owner && p.type === 'laser');
  const segments = [];
  const hits = [];
  const beamFx = [];
  traceRay(laser.r, laser.c, laser.dir, segments, hits, beamFx, new Set());
  drawBeams(segments); sfx.play('laser');
  beamFx.forEach((name, i) => setTimeout(() => sfx.play(name, .65), 110 + i * 85));
  setTimeout(() => {
    if (station.game !== g) return;
    const uniqueHits = [...new Map(hits.map(hit => [hit.id, hit])).values()];
    const processEntry = g.processLog?.[g.processLog.length - 1];
    const opticalText = beamFx.length ? `반사·분리 ${beamFx.length}회 · ` : '';
    if (uniqueHits.length) {
      uniqueHits.forEach(hit => { hit.alive = false; });
      const kingHit = uniqueHits.find(hit => hit.type === 'king');
      if (kingHit) {
        sfx.play('king'); setTimeout(() => sfx.play('victory', .85), 520);
        g.over = true; g.winnerId = owner === 'blue' ? station.match.blueId : station.match.redId; g.message = `${owner === 'blue' ? station.match.blueName : station.match.redName} 승리!`;
        if (processEntry) processEntry.laserResult = `${opticalText}${kingHit.owner === 'blue' ? '청색' : '적색'} 왕 제거 · 경기 종료`;
        saveStation(); gameView(); return;
      }
      sfx.play('destroy');
      g.message = uniqueHits.map(hit => `${hit.owner === 'blue' ? '청색' : '적색'} ${PIECE_NAMES[hit.type]}`).join(', ') + ' 제거';
    } else g.message = '레이저가 판 밖으로 빠져나갔습니다.';
    if (processEntry) processEntry.laserResult = `${opticalText}${g.message}`;
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
  return `<div class="result-overlay"><section class="result-modal"><p class="kicker">KING ELIMINATED</p><img class="victory-emblem" src="/images/logos/emblem_victory.png" alt="승리 왕관"><h2>${safe(winner)} 승리</h2><p>${safe(loser)}의 왕이 레이저에 맞았습니다.</p><div class="result-stats"><span><b>${g.turnCount}</b>턴</span><span><b>${fmtTime(now() - g.startedAt)}</b>경기 시간</span></div>${g.practice ? '<button class="primary large" data-action="practice-rematch">다시 연습하기</button>' : '<button class="primary large" data-action="submit-result">두 선수 확인 · 결과 전송</button>'}<small>결과 전송 후 교사 전광판에 즉시 반영됩니다.</small></section></div>`;
}

function resultAcceptedView() {
  setScreen('station');
  app.innerHTML = `${header(`${safe(station.number)}번 경기장`)}<main class="center shell"><section class="panel success-card"><div class="success-check">✓</div><p class="kicker">RESULT ACCEPTED</p><h2>경기 결과가 전송되었습니다</h2><p>교사 전광판과 실시간 순위에 반영되었습니다.</p><div class="countdown">다음 경기 준비 중 <b id="countdown">3</b></div></section></main>`;
  let n = 3; const timer = setInterval(() => { n--; const el = document.querySelector('#countdown'); if (el) el.textContent = n; if (n <= 0) { clearInterval(timer); stationLobbyView(); connectStation(); } }, 1000);
}

function stationSessionEndedView() {
  setScreen('station');
  app.innerHTML = `${header(`${safe(station.number)}번 경기장`)}<main class="center shell"><section class="panel success-card session-ended-card"><div class="success-check">◆</div><p class="kicker">SESSION CLOSED</p><h2>교사가 게임 운영을 종료했습니다</h2><p>진행 중이던 경기는 최종 순위에 반영되지 않습니다.<br>교사 결과 공개 화면에서 최종 순위를 확인하세요.</p><button class="secondary large" data-action="home">메인화면</button></section></main>`;
}

function buildRankingClipboard() {
  const header = ['순위', '플레이어', '경기 수', '승', '패', '승률', '승점', '평균 턴', '평균 경기 시간', '최고 연승'];
  const rows = standings().map((player, index) => [index + 1, player.name, player.games, player.wins, player.losses, `${player.winRate}%`, player.points, player.averageTurns, fmtTime(player.averageDurationMs), player.bestStreak]);
  return [`${host.title} 최종 순위`, header.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
}

function confettiMarkup() {
  const colors = ['#f6c85f', '#ff6680', '#50dcff', '#ffffff', '#8d72ff'];
  return `<div class="confetti-field" aria-hidden="true">${Array.from({ length: 72 }, (_, index) => `<i style="--x:${(index * 37) % 101};--delay:-${(index * 0.19).toFixed(2)}s;--duration:${5 + (index % 6) * .7}s;--drift:${(index % 2 ? 1 : -1) * (25 + (index % 5) * 9)}px;--color:${colors[index % colors.length]};--size:${6 + (index % 4) * 2}px"></i>`).join('')}</div>`;
}

function resultRevealView() {
  if (mode() !== 'results') history.replaceState(null, '', `${location.pathname}?mode=results`);
  setScreen('scoreboard');
  host = hostState();
  const rank = standings();
  app.innerHTML = `<main class="result-reveal-page">
    ${confettiMarkup()}
    <header class="result-reveal-header"><div><p class="eyebrow">더 지니어스 한 학급 놀이</p><h1>${safe(host.title)}</h1><span>FINAL RANKING</span></div><button class="icon-btn result-home-button" data-action="home" aria-label="메인 화면">⌂</button></header>
    <section class="final-ranking-card">
      <div class="final-ranking-title"><div><p class="kicker">LASER JANGGI FINAL RESULT</p><h2>최종 순위표</h2><p>완료된 ${host.matches.length}경기 기준 · 진행 중이던 경기는 제외되었습니다.</p></div><aside class="result-copy-box"><button class="primary" data-action="copy-ranking">게임 결과 복사하기</button><p>이 버튼을 클릭한 후 엑셀/한셀에 들어가셔서 붙여넣기 하면 게임 결과를 저장할 수 있습니다.</p></aside></div>
      <div class="final-ranking-table"><table><thead><tr><th>순위</th><th>플레이어</th><th>경기</th><th>승</th><th>패</th><th>승률</th><th>승점</th><th>평균 턴</th><th>평균 시간</th><th>최고 연승</th></tr></thead><tbody>${rank.map((player, index) => `<tr class="final-rank-${index + 1}"><td><span class="rank rank-${index + 1}">${index + 1}</span></td><td><strong>${safe(player.name)}</strong></td><td>${player.games}</td><td>${player.wins}</td><td>${player.losses}</td><td>${player.winRate}%</td><td><b>${player.points}</b></td><td>${player.averageTurns}</td><td>${fmtTime(player.averageDurationMs)}</td><td>${player.bestStreak}</td></tr>`).join('')}</tbody></table></div>
    </section>
  </main>`;
}

function endSessionAndReveal() {
  hostConnections.forEach(conn => { if (conn.open) conn.send({ type: 'SESSION_ENDED' }); });
  Object.values(host.stations).forEach(stationInfo => Object.assign(stationInfo, { status: 'ended', activeMatchId: null }));
  host.active = {};
  host.ended = true;
  host.endedAt = now();
  saveHost();
  broadcastRoster();
  resultRevealView();
}

async function copyText(value) {
  try { await navigator.clipboard.writeText(value); }
  catch {
    const textarea = document.createElement('textarea');
    textarea.value = value; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
    document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
  }
}

function showEndSessionModal() {
  document.querySelector('.session-modal-overlay')?.remove();
  const activeCount = Object.keys(host.active).length;
  document.body.insertAdjacentHTML('beforeend', `<div class="session-modal-overlay" role="presentation"><section class="session-modal" role="dialog" aria-modal="true" aria-labelledby="end-session-title"><div class="modal-symbol">◆</div><p class="kicker">FINAL RESULT</p><h2 id="end-session-title">게임을 종료하고 결과를 공개할까요?</h2><p>완료된 경기만 최종 순위에 반영되며 모든 학생 경기장의 운영이 종료됩니다.</p>${activeCount ? `<div class="modal-alert">현재 진행 중인 ${activeCount}경기는 종료되며 순위에 반영되지 않습니다.</div>` : '<div class="modal-ready">현재 진행 중인 경기가 없습니다.</div>'}<p class="modal-note">결과 공개 페이지에서 최종 순위표를 복사해 엑셀 또는 한셀에 붙여넣을 수 있습니다.</p><div class="button-row"><button class="secondary" data-action="close-session-modal">계속 운영하기</button><button class="danger" data-action="confirm-end-session">게임 종료·결과 공개</button></div></section></div>`);
}

function showHostHomeModal() {
  document.querySelector('.session-modal-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="session-modal-overlay" role="presentation"><section class="session-modal" role="dialog" aria-modal="true" aria-labelledby="host-home-title"><div class="modal-symbol">⌂</div><p class="kicker">RETURN HOME</p><h2 id="host-home-title">메인화면으로 이동할까요?</h2><div class="modal-alert">게임을 종료하시겠습니까? 모든 데이터가 초기화됩니다.</div><p class="modal-note">현재 플레이어 명단, 경기장 연결 상태, 순위와 경기 결과를 다시 불러올 수 없습니다.</p><div class="button-row"><button class="secondary" data-action="close-session-modal">계속 운영하기</button><button class="danger" data-action="confirm-host-home">게임 종료 후 이동</button></div></section></div>`);
}

document.addEventListener('click', async e => {
  const actionEl = e.target.closest('[data-action]');
  const action = actionEl?.dataset.action;
  if (!action) return;
  if (action === 'home') {
    if (mode() === 'host' || mode() === 'results') showHostHomeModal();
    else navigate('');
    return;
  }
  if (action === 'open-guide') { ui.guideSlide = 0; showGuideModal(); }
  if (action === 'close-guide') document.querySelector('.guide-modal-overlay')?.remove();
  if (action === 'guide-prev') showGuideModal(ui.guideSlide - 1);
  if (action === 'guide-next') showGuideModal(ui.guideSlide + 1);
  if (action === 'guide-jump') showGuideModal(Number(actionEl.dataset.slide));
  if (action === 'open-host') navigate('mode=intro');
  if (action === 'skip-intro' || action === 'finish-intro') navigate('mode=host');
  if (action === 'select-intro-subject') { ui.intro.subject = actionEl.dataset.subject; ui.intro.phase = 'lesson'; introLessonView(); }
  if (action === 'reveal-science-concept') {
    if (actionEl.dataset.concept === 'straight') ui.intro.straight = true;
    if (actionEl.dataset.concept === 'reflection' && ui.intro.straight) ui.intro.reflection = true;
    introLessonView();
  }
  if (action === 'animate-math-piece') animateMathPiece(actionEl.dataset.move);
  if (action === 'intro-to-speech') { ui.intro.phase = 'speech'; introSpeechView(); }
  if (action === 'open-station') navigate('mode=station');
  if (action === 'practice') navigate('mode=practice');
  if (action === 'join-room') {
    const code = document.querySelector('#join-code').value.replace(/\D/g, '');
    if (!/^\d{4}$/.test(code)) return toast('숫자 4자리 경기장 코드를 입력하세요.', 'error');
    navigate(`mode=station&room=${code}`);
  }
  if (action === 'set-station') { station.number = actionEl.dataset.number; station.status = 'ready'; saveStation(); stationLobbyView(); connectStation(); }
  if (action === 'confirm-roster') {
    const names = document.querySelector('#roster').value.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    if (names.length < 2) return toast('플레이어를 두 명 이상 등록하세요.', 'error');
    if (new Set(names).size !== names.length) return toast('중복된 이름이 있습니다.', 'error');
    host.title = document.querySelector('#room-title').value.trim() || '우리 반 레이저 장기'; host.players = names.map((name, i) => ({ id: `p-${i + 1}`, name })); host.rosterConfirmed = true; host.started = false; host.ended = false; sfx.play('confirm'); saveHost(); hostView();
  }
  if (action === 'start-operation') { host.started = true; host.ended = false; sfx.play('start'); setHostBgm(true); saveHost(); hostView(); }
  if (action === 'open-end-session-modal') showEndSessionModal();
  if (action === 'close-session-modal') document.querySelector('.session-modal-overlay')?.remove();
  if (action === 'confirm-host-home') {
    host.ended = true; broadcastRoster(); await setHostBgm(false); peer?.destroy(); peer = null; hostConnections.clear();
    sessionStorage.removeItem('laser-host'); navigate('');
  }
  if (action === 'confirm-end-session') {
    document.querySelector('.session-modal-overlay')?.remove();
    endSessionAndReveal();
  }
  if (action === 'new-session') { sessionStorage.removeItem('laser-host'); host = null; peer?.destroy(); peer = null; hostView(); }
  if (action === 'open-qr-modal') showQrModal();
  if (action === 'close-qr-modal') document.querySelector('.qr-modal-overlay')?.remove();
  if (action === 'copy-link') { await copyText(studentAccessUrl()); toast('학생 접속 링크를 복사했습니다.', 'success'); }
  if (action === 'fullscreen-board') document.querySelector('.scoreboard-panel')?.requestFullscreen();
  if (action === 'toggle-bgm') await setHostBgm(hostBgm.paused, true);
  if (action === 'copy-ranking') { await copyText(buildRankingClipboard()); sfx.play('confirm'); toast('최종 순위표를 복사했습니다. 엑셀 또는 한셀에 붙여넣으세요.', 'success'); }
  if (action === 'request-match') {
    const { blueId, redId } = ui.matchSelection;
    if (!blueId || !redId || blueId === redId) return toast('서로 다른 두 명을 선택하세요.', 'error');
    stationConnection.send({ type: 'MATCH_START_REQUEST', stationId: station.stationId, stationNumber: station.number, blueId, redId }); toast('교사 화면에서 참가 가능 여부를 확인 중입니다.');
  }
  if (action === 'select-player') {
    const playerId = actionEl.dataset.playerId;
    if (ui.matchSelection.blueId === playerId) ui.matchSelection.blueId = '';
    else if (ui.matchSelection.redId === playerId) ui.matchSelection.redId = '';
    else if (!ui.matchSelection.blueId) ui.matchSelection.blueId = playerId;
    else if (!ui.matchSelection.redId) ui.matchSelection.redId = playerId;
    else ui.matchSelection.redId = playerId;
    stationLobbyView();
  }
  if (action === 'clear-player') { ui.matchSelection[`${actionEl.dataset.side}Id`] = ''; stationLobbyView(); }
  if (action === 'resume-game') gameView();
  if (action === 'show-piece-help') showPieceHelpModal(actionEl.dataset.piece, actionEl.dataset.side);
  if (action === 'close-game-help') document.querySelector('.game-help-overlay')?.remove();
  if (action === 'open-abort-game-modal') showAbortGameModal(actionEl.dataset.side);
  if (action === 'confirm-abort-game') abortCurrentGame();
  if (action === 'rotate-left') rotateSelected(-1, e.target.closest('[data-action]')?.dataset.side || '');
  if (action === 'rotate-right') rotateSelected(1, e.target.closest('[data-action]')?.dataset.side || '');
  if (action === 'submit-result') {
    if (!stationConnection?.open) return toast('교사 화면과 다시 연결된 뒤 결과를 전송합니다.', 'error');
    const g = station.game; stationConnection.send({ type: 'MATCH_RESULT', stationId: station.stationId, matchId: station.match.matchId, winnerId: g.winnerId, durationMs: now() - g.startedAt, turnCount: g.turnCount, processLog: g.processLog || [], reason: 'king_destroyed' }); toast('결과를 전송하고 있습니다.');
  }
  if (action === 'practice-rematch') { station.game = null; startLocalGame({ ...station.match, matchId: uid('practice'), startedAt: now() }, true); }
});

document.addEventListener('click', e => {
  const cell = e.target.closest('.cell'); if (cell) handleCell(Number(cell.dataset.r), Number(cell.dataset.c));
});

document.addEventListener('input', e => {
  if (e.target.id === 'join-code') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  if (e.target.id === 'bgm-volume') {
    hostBgm.volume = Number(e.target.value);
    localStorage.setItem('laser-bgm-volume', String(hostBgm.volume));
  }
});

window.addEventListener('beforeunload', () => { clearInterval(heartbeatTimer); });

if (mode() === 'host') hostView();
else if (mode() === 'results') resultRevealView();
else if (mode() === 'intro') introView(true);
else if (mode() === 'station') stationView();
else if (mode() === 'practice') stationView(true);
else homeView();
