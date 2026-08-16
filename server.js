const express = require("express");
const {
    TikTokLiveConnection,
    WebcastEvent
} = require("tiktok-live-connector");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TIKTOK_USERNAME =
    process.env.TIKTOK_USERNAME || "subarunatsuki2.3";

const API_KEY =
    process.env.API_KEY || "RobloxTikTok_847291";

// ==================================================
// FILA
// ==================================================

let queue = [];
let nextId = 1;

// ==================================================
// TOP PRESENTES
// ==================================================

let topGifts = {};

function addGift(username, nickname, giftName, giftCount) {

    username = String(username || "TikTok");
    nickname = String(nickname || username);
    giftName = String(giftName || "Presente");

    const count = Number(giftCount) || 1;

    if (!topGifts[username]) {

        topGifts[username] = {
            username: username,
            nickname: nickname,
            gifts: 0,
            lastGift: giftName
        };

    }

    topGifts[username].gifts += count;
    topGifts[username].lastGift = giftName;
}

// ==================================================
// ADICIONAR JOGADOR
// ==================================================

function addRobloxUser(robloxUsername, tiktokSender) {

    robloxUsername = String(robloxUsername)
        .replace(/^@/, "")
        .trim();

    if (!robloxUsername) {
        return false;
    }

    const exists = queue.some(player =>
        player.robloxUsername.toLowerCase() ===
        robloxUsername.toLowerCase()
    );

    if (exists) {

        console.log(
            `Ignorado: ${robloxUsername} já está na fila`
        );

        return false;
    }

    const item = {
        id: nextId++,
        robloxUsername: robloxUsername,
        tiktokSender: tiktokSender || "TikTok",
        createdAt: Date.now()
    };

    queue.push(item);

    console.log("================================");
    console.log("🎮 NOVO JOGADOR");
    console.log("Roblox:", robloxUsername);
    console.log("TikTok:", tiktokSender);
    console.log("ID:", item.id);
    console.log("================================");

    return true;
}

// ==================================================
// EXTRAIR USERNAME ROBLOX
// ==================================================

function extractRobloxUsername(comment) {

    if (!comment) {
        return null;
    }

    comment = String(comment).trim();

    const direct =
        comment.match(/^@?([A-Za-z0-9_]{3,20})$/);

    if (direct) {
        return direct[1];
    }

    const command =
        comment.match(
            /(?:roblox|user|username)\s*:?\s*@?([A-Za-z0-9_]{3,20})/i
        );

    if (command) {
        return command[1];
    }

    return null;
}

// ==================================================
// TESTE
// ==================================================

app.get("/", (req, res) => {

    res.json({
        online: true,
        service: "TikTok → Roblox",
        queueSize: queue.length,
        topGifts: Object.values(topGifts)
    });

});

// ==================================================
// API KEY
// ==================================================

function checkApiKey(req, res, next) {

    const key =
        req.query.key ||
        req.headers["x-api-key"];

    if (key !== API_KEY) {

        return res.status(401).json({
            success: false,
            error: "API key inválida"
        });

    }

    next();
}

// ==================================================
// PEGAR FILA
// ==================================================

app.get(
    "/api/queue",
    checkApiKey,
    (req, res) => {

        res.json({
            success: true,
            players: queue
        });

    }
);

// ==================================================
// REMOVER DA FILA
// ==================================================

app.post(
    "/api/remove",
    checkApiKey,
    (req, res) => {

        const id = Number(req.body.id);

        if (!id) {

            return res.status(400).json({
                success: false,
                error: "ID inválido"
            });

        }

        const oldLength = queue.length;

        queue = queue.filter(
            player => player.id !== id
        );

        if (queue.length === oldLength) {

            return res.json({
                success: false,
                message: "ID não encontrado"
            });

        }

        console.log(
            `🗑️ Jogador removido: ID ${id}`
        );

        res.json({
            success: true
        });

    }
);

// ==================================================
// ADICIONAR MANUALMENTE
// ==================================================

app.post(
    "/api/add",
    checkApiKey,
    (req, res) => {

        const username = req.body.username;
        const sender = req.body.sender || "Teste";

        if (!username) {

            return res.status(400).json({
                success: false,
                error: "username obrigatório"
            });

        }

        const added =
            addRobloxUser(
                username,
                sender
            );

        res.json({
            success: true,
            added: added,
            queueSize: queue.length
        });

    }
);

// ==================================================
// TOP PRESENTES
// ==================================================

app.get(
    "/api/top",
    checkApiKey,
    (req, res) => {

        const ranking =
            Object.values(topGifts)
                .sort((a, b) => b.gifts - a.gifts)
                .slice(0, 10);

        res.json({
            success: true,
            top: ranking
        });

    }
);

// ==================================================
// TIKTOK
// ==================================================

let connection = null;
let connecting = false;

async function connectTikTok() {

    if (connecting) {
        return;
    }

    connecting = true;

    console.log("================================");
    console.log(
        "📱 Conectando ao TikTok:",
        TIKTOK_USERNAME
    );

    try {

        connection =
            new TikTokLiveConnection(
                TIKTOK_USERNAME,
                {
                    processInitialData: true
                }
            );

        // ==================================================
        // CHAT
        // ==================================================

        connection.on(
            WebcastEvent.CHAT,
            data => {

                try {

                    const comment =
                        String(
                            data.comment ||
                            data.message ||
                            data.content ||
                            data.text ||
                            ""
                        ).trim();

                    const sender =
                        data.user?.uniqueId ||
                        data.user?.unique_id ||
                        data.user?.nickname ||
                        "TikTok";

                    console.log(
                        `[CHAT] @${sender}: ${comment}`
                    );

                    const username =
                        extractRobloxUsername(comment);

                    if (username) {

                        console.log(
                            "🎮 Roblox encontrado:",
                            username
                        );

                        addRobloxUser(
                            username,
                            sender
                        );

                    }

                } catch (error) {

                    console.error(
                        "❌ Erro
