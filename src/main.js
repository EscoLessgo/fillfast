import './style.css'
import { NetworkManager } from './network.js';
import { DiscordManager } from './discord.js';
import { sfx } from './audio.js';

// --- Global State ---
let network;
let discord;
let currentUser = null;
let currentRoom = null;
let gameConfig = { rows: 6, cols: 6 };

// Game Local State
let hLines = [];
let vLines = [];
let boxes = [];
let myPlayerIndex = 0;
let isMyTurn = false;
let scores = { 1: 0, 2: 0 };
let gameOver = false;

// Drawing
let canvas, ctx;
let spacing, offsetX, offsetY;
const DOT_RADIUS = 6;
const LINE_WIDTH = 6;
const TOUCH_ZONE = 20;

const COLORS = {
  bg: '#1e1e1e',
  dot: '#ffffff',
  p1: '#00e676',
  p2: '#ff4081',
  line_hover: '#555'
};

// --- Initialization ---

async function init() {
  // --- 1. Bind UI Immediately (So buttons work) ---
  const btnCreate = document.getElementById('btn-create');
  if (btnCreate) {
    btnCreate.addEventListener('click', createLobby);
  }

  document.getElementById('btn-home').addEventListener('click', goHome);

  // Global Delegate for Join Buttons (Dynamic List)
  document.getElementById('room-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-join')) {
      sfx.click();
      const roomId = e.target.dataset.room;
      if (network) network.joinLobby(roomId, currentUser);
    }
  });

  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('click', handleInput);
  canvas.addEventListener('mousemove', handleHover);
  canvas.addEventListener('mouseleave', () => { hoveredLine = null; });
  window.addEventListener('resize', handleResize);

  // --- 2. Start Network (Game Server) ---
  // Connect to game server immediately
  document.getElementById('room-list').innerHTML = '<li class="empty-msg">Connecting to Server...</li>';
  network = new NetworkManager(handleNetworkEvent);

  // --- 3. Discord / User Setup (Non-blocking) ---
  document.getElementById('my-username').innerText = "Initializing...";

  // Default fallback user immediately so game is playable
  currentUser = { id: "guest_" + Date.now(), username: "Guest Player", discriminator: "0000" };
  updateLobbyProfile();

  // Try Discord in background (Fire and forget)
  // This will NOT block the rest of the execution
  discord = new DiscordManager();
  discord.init().then(() => {
    // If success, update user
    const discordUser = discord.getUser();
    if (discordUser) {
      currentUser = discordUser;
      updateLobbyProfile();
    }
  }).catch(e => {
    console.log("Discord init skipped or failed (expected locally):", e);
  });
}

function updateLobbyProfile() {
  document.getElementById('my-username').innerText = currentUser.username;
}

// --- Screens Navigation ---

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// --- Network Events ---

function handleNetworkEvent(type, data) {
  switch (type) {
    case 'connected':
      // Force request room list or just wait?
      // Usually server sends it on connect. 
      // We can update UI to show we are online.
      document.querySelector('.logo-large h1').style.color = "#00e676"; // Green title
      // If list is still "Connecting...", maybe server hasn't sent list yet.
      break;

    case 'room_list':
      renderRoomList(data);
      break;

    case 'lobby_created':
      currentRoom = data.state;
      enterWaitingRoom();
      break;

    case 'game_start':
      currentRoom = data.state;
      sfx.boxComplete(); // Start sound?
      startGame(data.state);
      break;

    case 'joined_spectator':
      currentRoom = data.state;
      startGame(data.state);
      break;

    case 'state_update':
      updateGameState(data.state);
      if (data.scorer) {
        sfx.boxComplete();
      } else {
        sfx.lineDraw();
        // Play turn switch only if *I* am now active or was active
        // Or just generic "tok"
        sfx.turnSwitch();
      }
      break;

    case 'game_over':
      updateGameState(data.state);
      gameOver = true;
      sfx.win();
      showResult(data.winner);
      break;

    case 'player_left':
      // Opponent left
      gameOver = true;
      document.getElementById('result-overlay').classList.remove('hidden');
      const txt = document.getElementById('winner-text');
      txt.innerText = "OPPONENT LEFT";
      txt.style.color = "#fff";
      // Update the name on the board to indicate they are gone
      if (data.pIndex === 1) document.getElementById('p1-name').innerText = "Disconnected";
      else document.getElementById('p2-name').innerText = "Disconnected";
      break;
  }
}

// --- Lobby Logic ---

function createLobby() {
  // Safely play sound
  try { sfx.click(); } catch (e) { }

  if (!currentUser) {
    console.error("No user set!");
    return;
  }
  network.createLobby(currentUser);
}

function renderRoomList(rooms) {
  const list = document.getElementById('room-list');
  list.innerHTML = '';

  if (rooms.length === 0) {
    list.innerHTML = `<li class="empty-msg" style="text-align:center;color:#666;padding:20px;">No active rooms found.<br>Create one!</li>`;
    return;
  }

  rooms.forEach(room => {
    const li = document.createElement('li');
    li.className = 'room-item';

    // Status Text
    let statusText = `${room.count}/2 Players`;
    if (room.status === 'Playing') statusText = 'Currently Playing';

    // Join Button State
    const canJoin = (room.count < 2);
    const btnText = canJoin ? 'JOIN' : 'WATCH';
    const btnClass = canJoin ? 'btn-join' : 'btn-join'; // Same style for now

    li.innerHTML = `
      <div class="room-info">
        <span class="room-name">${room.name}</span>
        <span class="room-status">${statusText}</span>
      </div>
      <button class="${btnClass}" data-room="${room.id}">${btnText}</button>
    `;
    list.appendChild(li);
  });
}

function enterWaitingRoom() {
  showScreen('waiting-screen');
  document.getElementById('lobby-code-display').innerText = currentRoom.id;
}

function goHome() {
  try { sfx.click(); } catch (e) { }
  location.reload();
}

// --- Game Logic ---

function startGame(state) {
  showScreen('game-screen');
  gameConfig = state.config;

  const mySlot = state.players.find(p => p.id === currentUser.id);
  myPlayerIndex = mySlot ? mySlot.pIndex : 0;

  // Update Names
  const p1 = state.players.find(p => p.pIndex === 1);
  const p2 = state.players.find(p => p.pIndex === 2);

  document.getElementById('p1-name').innerText = p1 ? p1.username : "Waiting...";
  document.getElementById('p2-name').innerText = p2 ? p2.username : "Waiting...";

  handleResize();
  updateGameState(state);
}

function updateGameState(state) {
  hLines = state.gameState.hLines;
  vLines = state.gameState.vLines;
  boxes = state.gameState.boxes;

  scores[1] = state.players.find(p => p.pIndex === 1)?.score || 0;
  scores[2] = state.players.find(p => p.pIndex === 2)?.score || 0;

  const turn = state.gameState.turn;
  isMyTurn = (turn === myPlayerIndex);

  document.getElementById('p1-score').innerText = scores[1];
  document.getElementById('p2-score').innerText = scores[2];

  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');

  if (turn === 1) {
    p1Card.classList.add('active');
    p2Card.classList.remove('active');
  } else {
    p1Card.classList.remove('active');
    p2Card.classList.add('active');
  }

  const status = document.getElementById('status-text');
  if (myPlayerIndex === 0) status.innerText = `Spectating Player ${turn}`;
  else if (isMyTurn) {
    status.innerText = "YOUR TURN";
    status.style.color = "#00f3ff";
  } else {
    status.innerText = "OPPONENT'S TURN";
    status.style.color = "#888";
  }

  draw();
}

function showResult(winnerIdx) {
  document.getElementById('result-overlay').classList.remove('hidden');
  const txt = document.getElementById('winner-text');

  if (myPlayerIndex === 0) {
    txt.innerText = `PLAYER ${winnerIdx} WINS!`;
    txt.style.color = winnerIdx === 1 ? COLORS.p1 : COLORS.p2;
  } else if (winnerIdx === myPlayerIndex) {
    txt.innerText = "YOU WIN!";
    txt.style.color = (winnerIdx === 1) ? COLORS.p1 : COLORS.p2;
  } else {
    txt.innerText = "YOU LOSE";
    txt.style.color = "#fff";
  }
}

// --- Input & Drawing ---

let hoveredLine = null;

function handleInput(e) {
  if (!isMyTurn || gameOver) return;
  if (!hoveredLine) return;
  network.makeMove(currentRoom.id, hoveredLine);
}

function handleHover(e) {
  if (gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  hoveredLine = getClosestLine(x, y);
}

function getClosestLine(x, y) {
  let bestDist = TOUCH_ZONE;
  let best = null;

  for (let r = 0; r <= gameConfig.rows; r++) {
    for (let c = 0; c < gameConfig.cols; c++) {
      if (hLines[r] && hLines[r][c] !== 0) continue;

      const x1 = offsetX + c * spacing;
      const y1 = offsetY + r * spacing;
      const x2 = x1 + spacing;
      const cy = y1;

      if (x >= x1 && x <= x2 && Math.abs(y - cy) < TOUCH_ZONE) {
        const dist = Math.abs(y - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { type: 'h', r, c };
        }
      }
    }
  }

  for (let r = 0; r < gameConfig.rows; r++) {
    for (let c = 0; c <= gameConfig.cols; c++) {
      if (vLines[r] && vLines[r][c] !== 0) continue;

      const x1 = offsetX + c * spacing;
      const y1 = offsetY + r * spacing;
      const y2 = y1 + spacing;
      const cx = x1;

      if (y >= y1 && y <= y2 && Math.abs(x - cx) < TOUCH_ZONE) {
        const dist = Math.abs(x - cx);
        if (dist < bestDist) {
          bestDist = dist;
          best = { type: 'v', r, c };
        }
      }
    }
  }
  return best;
}

function handleResize() {
  if (!canvas) return;
  const wrapper = canvas.parentElement;
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;

  const COLS = gameConfig.cols;
  const ROWS = gameConfig.rows;

  const availW = canvas.width - 40;
  const availH = canvas.height - 40;

  const maxCellW = availW / COLS;
  const maxCellH = availH / ROWS;

  spacing = Math.min(maxCellW, maxCellH);

  const boardW = spacing * COLS;
  const boardH = spacing * ROWS;

  offsetX = (canvas.width - boardW) / 2;
  offsetY = (canvas.height - boardH) / 2;

  draw();
}

function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < gameConfig.rows; r++) {
    for (let c = 0; c < gameConfig.cols; c++) {
      if (boxes[r] && boxes[r][c] !== 0) {
        const owner = boxes[r][c];
        const x = offsetX + c * spacing;
        const y = offsetY + r * spacing;

        ctx.fillStyle = owner === 1 ? COLORS.p1 : COLORS.p2;
        ctx.globalAlpha = 0.2;
        ctx.fillRect(x + LINE_WIDTH / 2, y + LINE_WIDTH / 2, spacing - LINE_WIDTH, spacing - LINE_WIDTH);

        ctx.globalAlpha = 1.0;
        ctx.font = `bold ${spacing / 2}px Outfit`;
        ctx.fillStyle = owner === 1 ? COLORS.p1 : COLORS.p2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(owner === 1 ? 'P1' : 'P2', x + spacing / 2, y + spacing / 2);
      }
    }
  }

  if (hLines.length > 0) {
    for (let r = 0; r <= gameConfig.rows; r++) {
      for (let c = 0; c < gameConfig.cols; c++) {
        const owner = hLines[r][c];
        const x = offsetX + c * spacing;
        const y = offsetY + r * spacing;
        drawLine(x, y, x + spacing, y, owner, 'h', r, c);
      }
    }
  }

  if (vLines.length > 0) {
    for (let r = 0; r < gameConfig.rows; r++) {
      for (let c = 0; c <= gameConfig.cols; c++) {
        const owner = vLines[r][c];
        const x = offsetX + c * spacing;
        const y = offsetY + r * spacing;
        drawLine(x, y, x, y + spacing, owner, 'v', r, c);
      }
    }
  }

  for (let r = 0; r <= gameConfig.rows; r++) {
    for (let c = 0; c <= gameConfig.cols; c++) {
      const cx = offsetX + c * spacing;
      const cy = offsetY + r * spacing;
      ctx.beginPath();
      ctx.arc(cx, cy, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.dot;
      ctx.shadowBlur = 5;
      ctx.shadowColor = COLORS.dot;
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}

function drawLine(x1, y1, x2, y2, owner, type, r, c) {
  let isHover = (!owner && hoveredLine && hoveredLine.type === type && hoveredLine.r === r && hoveredLine.c === c);

  if (owner === 0 && !isHover) return;

  ctx.lineCap = 'round';
  ctx.lineWidth = LINE_WIDTH;

  if (owner !== 0) {
    ctx.strokeStyle = owner === 1 ? COLORS.p1 : COLORS.p2;
    ctx.shadowBlur = 15;
    ctx.shadowColor = ctx.strokeStyle;
  } else {
    if (!isMyTurn) return;
    ctx.strokeStyle = COLORS.line_hover;
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

init();
