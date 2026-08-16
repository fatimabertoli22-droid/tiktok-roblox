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

// ID padrão da Rosa do TikTok.
// Também aceitamos o nome "Rose" / "Rosa".
const ROSE_GIFT_ID =
    Number(process.env.ROSE_GIFT_ID || 5655);

// ==================================================
// FILA
// ==================================================

let queue = [];

let nextId = 1;

// ==================================================
// EVENTOS PARA O ROBLOX
// ==================================================

let eventId = 0;

let lastEvent = null;

// ==================================================
// TOP DE PRESENTES
// ==================================================

let topGifters = {};

// ==================================================
// ADICIONAR JOGADOR
// ==================================================

function addRobloxUser(
    robloxUsername,
    tiktokSender
) {

    robloxUsername = String(robloxUsername)
        .replace(/^@/, "")
        .trim();

    if (!robloxUsername) {
        return false;
    }

    const exists = queue.some(
        player =>
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

        robloxUsername,

        tiktokSender:
            tiktokSender || "TikTok",

        createdAt: Date.now()

    };

    queue.push(item);

    console.log(
        "================================"
    );

    console.log("🎮 NOVO JOGADOR");

    console.log(
        "Roblox:",
        robloxUsername
    );

    console.log(
        "TikTok:",
        tiktokSender
    );

    console.log(
        "ID:",
        item.id
    );

    console.log(
        "================================"
    );

    return true;
}

// ==================================================
// API KEY
// ==================================================

function checkApiKey(
    req,
    res,
    next
) {

    const key =
        req.query.key ||
        req.headers["x-api-key"];

    if (key !== API_KEY) {

        return res.status(401).json({

            success: false,

            error:
                "API key inválida"

        });

    }

    next();
}

// ==================================================
// HOME
// ==================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            online: true,

            service:
                "TikTok → Roblox",

            queueSize:
                queue.length,

            tiktok:
                TIKTOK_USERNAME,

            roseGiftId:
                ROSE_GIFT_ID,

            lastEvent

        });

    }
);

// ==================================================
// FILA
// ==================================================

app.get(
    "/api/queue",
    checkApiKey,
    (req, res) => {

        console.log(
            `📡 Roblox pediu a fila: ${queue.length}`
        );

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

        const id =
            Number(req.body.id);

        if (!id) {

            return res.status(400).json({

                success: false,

                error:
                    "ID inválido"

            });

        }

        const oldLength =
            queue.length;

        queue =
            queue.filter(
                player =>
                    player.id !== id
            );

        if (
            queue.length ===
            oldLength
        ) {

            return res.json({

                success: false,

                message:
                    "ID não encontrado"

            });

        }

        console.log(
            `🗑️ Removido da fila: ${id}`
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

        const username =
            req.body.username;

        const sender =
            req.body.sender ||
            "Teste";

        if (!username) {

            return res.status(400).json({

                success: false,

                error:
                    "username obrigatório"

            });

        }

        const added =
            addRobloxUser(
                username,
                sender
            );

        res.json({

            success: true,

            added,

            queueSize:
                queue.length

        });

    }
);

// ==================================================
// EVENTO PARA ROBLOX
// ==================================================

app.get(
    "/api/event",
    checkApiKey,
    (req, res) => {

        res.json({

            success: true,

            eventId,

            event:
                lastEvent

        });

    }
);

// ==================================================
// TOP
// ==================================================

app.get(
    "/api/top",
    checkApiKey,
    (req, res) => {

        const list =
            Object.values(topGifters)
                .sort(
                    (a, b) =>
                        b.coins -
                        a.coins
                )
                .slice(0, 10);

        res.json({

            success: true,

            top: list

        });

    }
);

// ==================================================
// EXTRAIR USERNAME ROBLOX
// ==================================================

function extractRobloxUsername(
    comment
) {

    if (!comment) {
        return null;
    }

    comment =
        String(comment).trim();

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

// ==================================================
// CONECTAR
// ==================================================

async function connectTikTok() {

    if (connecting) {
        return;
    }

    connecting = true;

    console.log(
        "================================"
    );

    console.log(
        "📱 Conectando ao TikTok:",
        TIKTOK_USERNAME
    );

    try {

        connection =
            new TikTokLiveConnection(
                TIKTOK_USERNAME,
                {
                    processInitialData: true,

                    enableExtendedGiftInfo: true
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
                            ""
                        ).trim();

                    const sender =
                        data.user?.uniqueId ||
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

                    const giftId =
                        Number(
                            data.giftId
                        );

                    const repeatCount =
                        Number(
                            data.repeatCount ||
                            1
                        );

                    const giftName =
                        data.giftDetails?.giftName ||
                        data.giftName ||
                        "Presente";

                    const giftType =
                        data.giftDetails?.giftType ??
                        data.giftType;

                    const repeatEnd =
                        data.repeatEnd;

                    const sender =
                        data.user?.uniqueId ||
                        data.user?.nickname ||
                        "TikTok";

                    console.log(
                        "================================"
                    );

                    console.log(
                        "🎁 PRESENTE RECEBIDO"
                    );

                    console.log(
                        "👤:",
                        sender
                    );

                    console.log(
                        "🎁 Presente:",
                        giftName
                    );

                    console.log(
                        "🆔 Gift ID:",
                        giftId
                    );

                    console.log(
                        "🔢 Quantidade:",
                        repeatCount
                    );

                    console.log(
                        "================================"
                    );

                    // ==================================================
                    // TOP
                    // ==================================================

                    if (
                        !topGifters[sender]
                    ) {

                        topGifters[sender] = {

                            username:
                                sender,

                            coins: 0,

                            gifts: 0

                        };

                    }

                    const diamondCount =
                        Number(
                            data.diamondCount ||
                            1
                        );

                    topGifters[sender].coins +=
                        diamondCount *
                        repeatCount;

                    topGifters[sender].gifts +=
                        repeatCount;

                    // ==================================================
                    // ROSA
                    // ==================================================

                    const isRose =
                        giftId ===
                            ROSE_GIFT_ID ||

                        String(
                            giftName
                        ).toLowerCase()
                            .includes("rose") ||

                        String(
                            giftName
                        ).toLowerCase()
                            .includes("rosa");

                    if (!isRose) {

                        return;

                    }

                    // Para presentes em streak,
                    // esperamos o evento final.
                    if (
                        giftType === 1 &&
                        repeatEnd === false
                    ) {

                        console.log(
                            "🌹 Rosa em sequência. Aguardando final..."
                        );

                        return;

                    }

                    // ==================================================
                    // EVENTO ROSA
                    // ==================================================

                    eventId++;

                    lastEvent = {

                        id:
                            eventId,

                        type:
                            "ROSE",

                        gift:
                            "Rosa",

                        giftId,

                        count:
                            repeatCount,

                        sender,

                        createdAt:
                            Date.now()

                    };

                    console.log(
                        "🌹🌹🌹 ROSA DETECTADA! 🌹🌹🌹"
                    );

                    console.log(
                        "👤 Enviada por:",
                        sender
                    );

                    console.log(
                        "🔢 Quantidade:",
                        repeatCount
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
            "================================"
        );

        console.log(
            "✅ TIKTOK CONECTADO!"
        );

        console.log(
            "================================"
        );

    } catch (error) {

        console.error(
            "❌ Erro ao conectar:",
            error
        );

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
            "🚀 TIKTOK → ROBLOX ONLINE"
        );

        console.log(
            "🌐 Porta:",
            PORT
        );

        console.log(
            "📱 TikTok:",
            TIKTOK_USERNAME
        );

        console.log(
            "🌹 ID Rosa:",
            ROSE_GIFT_ID
        );

        console.log(
            "🎮 /api/queue"
        );

        console.log(
            "🌹 /api/event"
        );

        console.log(
            "🏆 /api/top"
        );

        console.log(
            "=================================================="
        );

        connectTikTok();

    }
);
