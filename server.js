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
// FILA
// ==================================================

let queue = [];
let nextId = 1;

// ==================================================
// ADICIONAR USUÁRIO
// ==================================================

function addRobloxUser(robloxUsername, tiktokSender) {

    robloxUsername = String(robloxUsername)
        .replace(/^@/, "")
        .trim();

    if (!robloxUsername) {
        return false;
    }

    // Verifica se já está na fila
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
// TESTE DA API
// ==================================================

app.get("/", (req, res) => {

    res.json({
        online: true,
        service: "TikTok → Roblox",
        queueSize: queue.length,
        tiktok: TIKTOK_USERNAME
    });

});

// ==================================================
// MIDDLEWARE DA API
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
// ROBLOX PEGA A FILA
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
// ROBLOX REMOVE JOGADOR
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
                error: "ID inválido"
            });

        }

        const oldLength =
            queue.length;

        queue = queue.filter(
            player =>
                player.id !== id
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

        const username =
            req.body.username;

        const sender =
            req.body.sender || "Teste";

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
// VER FILA PELO NAVEGADOR
// ==================================================

app.get(
    "/api/status",
    checkApiKey,
    (req, res) => {

        res.json({
            success: true,
            queueSize: queue.length,
            players: queue
        });

    }
);

// ==================================================
// TIKTOK
// ==================================================

let connection = null;
let connecting = false;

// ==================================================
// EXTRAIR USERNAME ROBLOX
// ==================================================

function extractRobloxUsername(comment) {

    if (!comment) {
        return null;
    }

    comment = String(comment).trim();

    // ----------------------------------------------
    // Apenas username
    // Exemplo:
    // eliseucoco18
    // @eliseucoco18
    // ----------------------------------------------

    const direct =
        comment.match(
            /^@?([A-Za-z0-9_]{3,20})$/
        );

    if (direct) {
        return direct[1];
    }

    // ----------------------------------------------
    // Comando roblox
    // Exemplo:
    // roblox eliseucoco18
    // roblox: eliseucoco18
    // ----------------------------------------------

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
// CONECTAR TIKTOK
// ==================================================

async function connectTikTok() {

    if (connecting) {
        return;
    }

    connecting = true;

    if (
        !TIKTOK_USERNAME ||
        TIKTOK_USERNAME ===
        "COLOQUE_SEU_TIKTOK_AQUI"
    ) {

        console.log(
            "⚠️ TikTok não configurado."
        );

        connecting = false;

        return;
    }

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

                    console.log(
                        "========== CHAT RECEBIDO =========="
                    );

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

                    if (!comment) {

                        console.log(
                            "⚠️ Mensagem vazia."
                        );

                        return;
                    }

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

                    } else {

                        console.log(
                            "Nenhum username Roblox encontrado."
                        );

                    }

                } catch (error) {

                    console.error(
                        "❌ Erro processando mensagem do TikTok:"
                    );

                    console.error(error);

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

        console.log(
            "================================"
        );

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
// INICIAR SERVIDOR
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
            "🎮 API da fila: /api/queue"
        );

        console.log(
            "🗑️ API remover: /api/remove"
        );

        console.log(
            "➕ API adicionar: /api/add"
        );

        console.log(
            "=================================================="
        );

        connectTikTok();

    }
);
