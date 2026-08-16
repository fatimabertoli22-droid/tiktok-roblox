
const express = require("express");
const {
    TikTokLiveConnection,
    WebcastEvent
} = require("tiktok-live-connector");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==================================================
// CONFIGURAÇÕES
// ==================================================

const TIKTOK_USERNAME =
    process.env.TIKTOK_USERNAME || "subarunatsuki2.3";

const API_KEY =
    process.env.API_KEY || "RobloxTikTok_847291";

// ==================================================
// FILA ROBLOX
// ==================================================

let queue = [];
let nextId = 1;

// ==================================================
// TOP DE PRESENTES
// ==================================================

let topGifts = {};

function addGift(username, nickname, giftName, diamonds) {

    username = String(username || "TikTok");
    nickname = String(nickname || username);
    giftName = String(giftName || "Presente");

    diamonds = Number(diamonds) || 0;

    if (!topGifts[username]) {

        topGifts[username] = {
            username: username,
            nickname: nickname,
            gifts: 0,
            diamonds: 0
        };

    }

    topGifts[username].gifts += 1;
    topGifts[username].diamonds += diamonds;

    console.log("================================");
    console.log("🎁 NOVO PRESENTE");
    console.log("👤 TikTok:", username);
    console.log("📛 Nome:", nickname);
    console.log("🎁 Presente:", giftName);
    console.log("💎 Diamonds:", diamonds);
    console.log("🎁 Total presentes:", topGifts[username].gifts);
    console.log("================================");

}

// ==================================================
// ADICIONAR USUÁRIO NA FILA
// ==================================================

function addRobloxUser(robloxUsername, tiktokSender) {

    robloxUsername = String(robloxUsername)
        .replace(/^@/, "")
        .trim();

    if (!robloxUsername) {
        return false;
    }

    const alreadyExists = queue.some(
        player =>
            player.robloxUsername.toLowerCase() ===
            robloxUsername.toLowerCase()
    );

    if (alreadyExists) {

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
// PÁGINA PRINCIPAL
// ==================================================

app.get("/", (req, res) => {

    res.json({
        online: true,
        service: "TikTok → Roblox",
        queueSize: queue.length,
        topSize: Object.keys(topGifts).length,
        tiktok: TIKTOK_USERNAME
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
// FILA
// ==================================================

app.get(
    "/api/queue",
    checkApiKey,
    (req, res) => {

        console.log(
            `📡 Roblox solicitou a fila. Jogadores: ${queue.length}`
        );

        res.json({
            success: true,
            players: queue
        });

    }
);

// ==================================================
// REMOVER DA FILA POR ID
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
            `🗑️ Jogador removido da fila: ${id}`
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
// TOP 3
// ==================================================

app.get(
    "/api/top",
    checkApiKey,
    (req, res) => {

        const top = Object.values(topGifts)
            .sort((a, b) => {

                if (b.diamonds !== a.diamonds) {
                    return b.diamonds - a.diamonds;
                }

                return b.gifts - a.gifts;

            })
            .slice(0, 3)
            .map((player, index) => ({

                position: index + 1,

                username: player.username,

                nickname: player.nickname,

                gifts: player.gifts,

                diamonds: player.diamonds

            }));

        res.json({
            success: true,
            top: top
        });

    }
);

// ==================================================
// STATUS
// ==================================================

app.get(
    "/api/status",
    checkApiKey,
    (req, res) => {

        res.json({

            success: true,

            queueSize: queue.length,

            players: queue,

            top: Object.values(topGifts)
                .sort(
                    (a, b) =>
                        b.diamonds - a.diamonds
                )
                .slice(0, 3)

        });

    }
);

// ==================================================
// EXTRAIR USERNAME ROBLOX
// ==================================================

function extractRobloxUsername(comment) {

    if (!comment) {
        return null;
    }

    comment = String(comment).trim();

    const direct =
        comment.match(
            /^@?([A-Za-z0-9_]{3,20})$/
        );

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
                        extractRobloxUsername(
                            comment
                        );

                    if (username) {

                        console.log(
                            "🎮 Username Roblox encontrado:",
                            username
                        );

                        addRobloxUser(
                            username,
                            sender
                        );

                    }

                } catch (error) {

                    console.error(
                        "❌ Erro no CHAT:",
                        error
                    );

                }

            }
        );

        // ==================================================
        // PRESENTES
        // ==================================================

        connection.on(
            WebcastEvent.GIFT,
            data => {

                try {

                    const user =
                        data.user ||
                        {};

                    const username =
                        user.uniqueId ||
                        user.unique_id ||
                        user.nickname ||
                        "TikTok";

                    const nickname =
                        user.nickname ||
                        username;

                    const gift =
                        data.giftDetails ||
                        data.gift ||
                        {};

                    const giftName =
                        gift.name ||
                        data.giftName ||
                        "Presente";

                    const diamondCount =
                        Number(
                            gift.diamondCount ||
                            gift.diamond_count ||
                            data.diamondCount ||
                            0
                        );

                    const repeatCount =
                        Number(
                            data.repeatCount ||
                            data.repeat_count ||
                            1
                        );

                    const totalDiamonds =
                        diamondCount *
                        repeatCount;

                    addGift(
                        username,
                        nickname,
                        giftName,
                        totalDiamonds
                    );

                } catch (error) {

                    console.error(
                        "❌ Erro processando presente:",
                        error
                    );

                }

            }
        );

        // ==================================================
        // CONECTAR
        // ==================================================

        await connection.connect();

        console.log(
            "✅ TikTok conectado com sucesso!"
        );

        console.log("================================");

    } catch (error) {

        console.error(
            "❌ Erro ao conectar no TikTok:"
        );

        console.error(error);

        console.log(
            "🔄 Tentando novamente em 15 segundos..."
        );

        setTimeout(
            () => {

                connecting = false;
                connectTikTok();

            },
            15000
        );

        return;
    }

    connecting = false;
}

// ==================================================
// SERVIDOR
// ==================================================

app.listen(
    PORT,
    () => {

        console.log(
            "=================================================="
        );

        console.log(
            "🚀 SERVIDOR TIKTOK → ROBLOX ONLINE"
        );

        console.log(
            `🌐 Porta: ${PORT}`
        );

        console.log(
            `📱 TikTok: ${TIKTOK_USERNAME}`
        );

        console.log(
            "🎮 API: /api/queue"
        );

        console.log(
            "🗑️ Remover: /api/remove"
        );

        console.log(
            "🏆 TOP: /api/top"
        );

        console.log(
            "🎁 Presentes: ATIVADO"
        );

        console.log(
            "=================================================="
        );

        connectTikTok();

    }
);
```
