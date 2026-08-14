const express = require("express");
const {
    TikTokLiveConnection,
    WebcastEvent
} = require("tiktok-live-connector");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ========================================
// CONFIGURAÇÕES
// ========================================

const TIKTOK_USERNAME =
    process.env.TIKTOK_USERNAME || "subarunatsuki2.3";

const API_KEY =
    process.env.API_KEY || "RobloxTikTok_847291";

// ========================================
// FILA
// ========================================

let queue = [];
let nextId = 1;

// ========================================
// ADICIONAR JOGADOR
// ========================================

function addRobloxUser(robloxUsername, tiktokSender) {

    robloxUsername = String(robloxUsername)
        .replace("@", "")
        .trim();

    if (!robloxUsername) {
        return;
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

        return;
    }

    const item = {
        id: nextId++,
        robloxUsername: robloxUsername,
        tiktokSender: tiktokSender,
        createdAt: Date.now()
    };

    queue.push(item);

    console.log("================================");
    console.log("NOVO JOGADOR");
    console.log("Roblox:", robloxUsername);
    console.log("TikTok:", tiktokSender);
    console.log("ID:", item.id);
    console.log("================================");
}

// ========================================
// TESTE
// ========================================

app.get("/", (req, res) => {

    res.json({
        online: true,
        service: "TikTok → Roblox",
        queueSize: queue.length,
        tiktok: TIKTOK_USERNAME
    });

});

// ========================================
// ROBLOX PEGA A FILA
// ========================================

app.get("/api/queue", (req, res) => {

    if (req.query.key !== API_KEY) {

        return res.status(401).json({
            error: "API key inválida"
        });

    }

    res.json({
        success: true,
        players: queue
    });

});

// ========================================
// ROBLOX REMOVE JOGADOR
// ========================================

app.post("/api/remove", (req, res) => {

    if (req.query.key !== API_KEY) {

        return res.status(401).json({
            error: "API key inválida"
        });

    }

    const id = Number(req.body.id);

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

    res.json({
        success: true
    });

});

// ========================================
// ADICIONAR MANUALMENTE
// ========================================

app.post("/api/add", (req, res) => {

    if (req.query.key !== API_KEY) {

        return res.status(401).json({
            error: "API key inválida"
        });

    }

    const username = req.body.username;
    const sender = req.body.sender || "Teste";

    if (!username) {

        return res.status(400).json({
            error: "username obrigatório"
        });

    }

    addRobloxUser(
        username,
        sender
    );

    res.json({
        success: true
    });

});

// ========================================
// TIKTOK
// ========================================

let connection = null;

async function connectTikTok() {

    if (
        !TIKTOK_USERNAME ||
        TIKTOK_USERNAME === "COLOQUE_SEU_TIKTOK_AQUI"
    ) {

        console.log(
            "TikTok não configurado."
        );

        return;
    }

    console.log(
        "Conectando ao TikTok:",
        TIKTOK_USERNAME
    );

    connection = new TikTokLiveConnection(
        TIKTOK_USERNAME,
        {
            processInitialData: true
        }
    );

    // ========================================
    // CHAT
    // ========================================

    connection.on(
        WebcastEvent.CHAT,
        data => {

            const comment =
                String(data.comment || "").trim();

            const sender =
                data.user?.uniqueId ||
                data.user?.nickname ||
                "TikTok";

            console.log(
                `[CHAT] @${sender}: ${comment}`
            );

            let username = null;

            // @Elias123
            // Elias123

            const direct =
                comment.match(
                    /^@?([A-Za-z0-9_]{3,20})$/
                );

            if (direct) {

                username = direct[1];

            } else {

                // roblox: @Elias123
                // roblox Elias123
                // !roblox @Elias123
                // user: Elias123
                // username Elias123

                const command =
                    comment.match(
                        /(?:roblox|user|username)\s*:?\s*@?([A-Za-z0-9_]{3,20})/i
                    );

                if (command) {

                    username = command[1];

                }
            }

            if (username) {

                addRobloxUser(
                    username,
                    sender
                );

            }

        }
    );

    // ========================================
    // CONECTADO
    // ========================================

    connection.on(
        WebcastEvent.CONNECTED,
        state => {

            console.log(
                "================================"
            );

            console.log(
                "TIKTOK CONECTADO!"
            );

            console.log(
                "Usuário:",
                TIKTOK_USERNAME
            );

            console.log(
                "Room ID:",
                state.roomId
            );

            console.log(
                "================================"
            );

        }
    );

    // ========================================
    // CONECTAR
    // ========================================

    try {

        await connection.connect();

    } catch (error) {

        console.error(
            "Erro ao conectar no TikTok:"
        );

        console.error(error);

        console.log(
            "Tentando novamente em 15 segundos..."
        );

        setTimeout(
            connectTikTok,
            15000
        );

    }

}

// ========================================
// SERVIDOR
// ========================================

app.listen(
    PORT,
    () => {

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

        connectTikTok();

    }
);
