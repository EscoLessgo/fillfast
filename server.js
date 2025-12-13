import { Server } from "socket.io";

const io = new Server(3001, {
    cors: { origin: "*" }
});

const rooms = new Map();

io.on("connection", (socket) => {
    // Send current room list to new connector
    emitRoomList(socket);

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
            const newPlayer = { ...userData, socketId: socket.id, pIndex: 2, score: 0 };
            room.players.push(newPlayer);
            socket.join(roomId);

            initBoard(room);
            io.to(roomId).emit("game_start", { state: room });

            // Update room list (maybe show it as Full or removed?)
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
        // Basic cleanup: if host leaves, maybe close room?
        // For now, if a room is empty, delete it.
        let changed = false;
        for (const [id, room] of rooms.entries()) {
            const pIdx = room.players.findIndex(p => p.socketId === socket.id);
            if (pIdx !== -1) {
                // Player left
                room.players.splice(pIdx, 1);
                if (room.players.length === 0) {
                    rooms.delete(id);
                }
                changed = true;
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

console.log("Server running on 3001...");
