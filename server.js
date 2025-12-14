import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Serve static files from 'dist' directory (Vite build)
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.json()); // Enable JSON body parsing

// Discord Token Exchange Proxy
app.post("/api/token", async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "No code provided" });

        const response = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.VITE_DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET, // MUST SET THIS IN RAILWAY
                grant_type: "authorization_code",
                code: code,
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            console.error("Discord Token Error:", data);
            return res.status(500).json({ error: "Failed to fetch token", details: data });
        }
        res.json({ access_token: data.access_token });
    } catch (e) {
        console.error("Token Exchange Exception:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Handle SPA routing - send all other requests to index.html
// EXCLUDE /socket.io so polling requests don't get stuck serving HTML
app.get(/^(?!\/socket\.io).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const rooms = new Map();

io.on("connection", (socket) => {
    // Send current room list to new connector
    emitRoomList(socket);

    socket.on("request_room_list", () => {
        emitRoomList(socket);
    });

    socket.on("create_lobby", (userData) => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();

        rooms.set(roomId, {
            id: roomId,
            host: userData.username, // Store host name for display
            players: [{ ...userData, socketId: socket.id, pIndex: 1, score: 0 }],
            spectators: [],
            gameState: {
                hLines: [],
                vLines: [],
                boxes: [],
                turn: 1,
                gameOver: false
            },
            config: { rows: 6, cols: 6 }
        });

        socket.join(roomId);
        socket.emit("lobby_created", { roomId, state: rooms.get(roomId) });

        // Broadcast new room list to everyone
        broadcastRoomList();
    });

    socket.on("join_lobby", ({ roomId, userData }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit("error", "Room not found");
            return;
        }

        if (room.players.length < 2) {
            // Determine available pIndex (1 or 2)
            const takenIndices = room.players.map(p => p.pIndex);
            const newPIndex = takenIndices.includes(1) ? 2 : 1;

            const newPlayer = { ...userData, socketId: socket.id, pIndex: newPIndex, score: 0 };
            room.players.push(newPlayer);
            socket.join(roomId);

            initBoard(room);
            // If we are filling a gap, maybe we shouldn't reset the board entirely?
            // But for this simple game, maybe we do. 
            // The user report implies "leaving" breaks things. 
            // If we treat "leaving" as forfeit, then re-joining is a restart?
            // "initBoard(room)" resets the game state. 
            // If the user wants to *resume*, that's different.
            // But based on "initBoard" being here, it forces a restart.
            // If a player left, the game "ended". So restarting is fine.
            // BUT we must make sure the OTHER player knows it restarted.
            io.to(roomId).emit("game_start", { state: room });

            // Update room list
            broadcastRoomList();
        } else {
            // Spectator
            room.spectators.push({ ...userData, socketId: socket.id });
            socket.join(roomId);
            socket.emit("joined_spectator", { state: room });
        }
    });

    socket.on("make_move", ({ roomId, move }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || sender.pIndex !== room.gameState.turn) return;

        let moveValid = false;
        const { type, r, c } = move;

        if (type === 'h') {
            if (room.gameState.hLines[r][c] === 0) {
                room.gameState.hLines[r][c] = sender.pIndex;
                moveValid = true;
            }
        } else {
            if (room.gameState.vLines[r][c] === 0) {
                room.gameState.vLines[r][c] = sender.pIndex;
                moveValid = true;
            }
        }

        if (moveValid) {
            const completed = checkBoxes(room.gameState, sender.pIndex);
            if (completed.length > 0) {
                sender.score += completed.length;
                if (checkWin(room)) {
                    room.gameState.gameOver = true;
                    io.to(roomId).emit("game_over", { state: room, winner: sender.pIndex });
                } else {
                    io.to(roomId).emit("state_update", { state: room, lastMove: move, scorer: sender.pIndex });
                }
            } else {
                room.gameState.turn = room.gameState.turn === 1 ? 2 : 1;
                io.to(roomId).emit("state_update", { state: room, lastMove: move });
            }
        }
    });

    socket.on("disconnect", () => {
        let changed = false;

        for (const [id, room] of rooms.entries()) {
            // 1. Check Players
            const pIdx = room.players.findIndex(p => p.socketId === socket.id);
            if (pIdx !== -1) {
                const player = room.players[pIdx];
                room.players.splice(pIdx, 1);

                // Notify remaining clients in the room
                io.to(id).emit("player_left", { pIndex: player.pIndex });

                if (room.players.length === 0) {
                    rooms.delete(id);
                }
                changed = true;
            }

            // 2. Check Spectators
            const sIdx = room.spectators.findIndex(s => s.socketId === socket.id);
            if (sIdx !== -1) {
                room.spectators.splice(sIdx, 1);
                // Optional: notify spectators count changed?
            }
        }

        if (changed) broadcastRoomList();
    });
});

function emitRoomList(socket) {
    const list = Array.from(rooms.values()).map((r, index) => ({
        id: r.id,
        name: `Room #${index + 1}`,
        count: r.players.length,
        status: r.players.length >= 2 ? 'Playing' : 'Waiting'
    }));
    socket.emit("room_list", list);
}

function broadcastRoomList() {
    const list = Array.from(rooms.values()).map((r, index) => ({
        id: r.id,
        name: `Room #${index + 1}`,
        count: r.players.length,
        status: r.players.length >= 2 ? 'Playing' : 'Waiting'
    }));
    io.emit("room_list", list);
}

function initBoard(room) {
    const { rows, cols } = room.config;
    room.gameState.hLines = Array(rows + 1).fill(0).map(() => Array(cols).fill(0));
    room.gameState.vLines = Array(rows).fill(0).map(() => Array(cols + 1).fill(0));
    room.gameState.boxes = Array(rows).fill(0).map(() => Array(cols).fill(0));
}

function checkBoxes(state, pIndex) {
    const { hLines, vLines, boxes } = state;
    const newBoxes = [];

    for (let r = 0; r < boxes.length; r++) {
        for (let c = 0; c < boxes[0].length; c++) {
            if (boxes[r][c] !== 0) continue;
            if (hLines[r][c] && hLines[r + 1][c] && vLines[r][c] && vLines[r][c + 1]) {
                boxes[r][c] = pIndex;
                newBoxes.push({ r, c });
            }
        }
    }
    return newBoxes;
}

function checkWin(room) {
    const total = room.config.rows * room.config.cols;
    const taken = room.players.reduce((acc, p) => acc + p.score, 0);
    return taken >= total;
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}...`);
});
