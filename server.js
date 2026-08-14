const express = require("express");
const {
    TikTokLiveConnection,
    WebcastEvent
} = require("tiktok-live-connector");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURAÇÕES
// ===============================

const TIKTOK_USERNAME =
    process.env.TIKTOK_USERNAME || "COLOQUE_SEU_TIKTOK_AQUI";

const API_KEY =
    process.env.API_KEY || "TROQUE_ESSA_CHAVE";

// ===============================
// FILA
// ===============================

let queue = [];

let nextId = 1;

// ===============================
// FUNÇÃO PARA ADICIONAR USER
// ===============================

function addRobloxUser(robloxUsername, tiktokSender) {

    robloxUsername = robloxUsername
        .replace("@", "")
        .trim();

    if (!robloxUsername) {
        return;
    }

    // Evita spam do mesmo jogador
    const alreadyExists = queue.some(
        x =>
            x.robloxUsername.toLowerCase() ===
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
    console.log("================================");
}

// ===============================
// TESTE MANUAL
// ===============================

app.get("/", (req, res) => {

    res.json({
        online: true,
        service: "TikTok → Roblox",
        queueSize: queue.length,
        tiktok: TIKTOK_USERNAME
    });

});

// ===============================
// ROBLOX PEGA A FILA
// ===============================

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

// ===============================
// ROBLOX REMOVE ITEM DA FILA
// ===============================

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

// ===============================
// ADICIONAR MANUALMENTE
// ===============================

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

    addRobloxUser(username, sender);

    res.json({
        success: true
    });

});

// ===============================
// TIKTOK
// ===============================

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

    );
  

   connection =
    new TikTokLiveConnection(
        TIKTOK_USERNAME,
        {
            processInitialData: true
        }
    );

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

            // Aceita:
            // @Elias123
            // Elias123
            //
            // Também aceita:
            // roblox: @Elias123
            // !roblox @Elias123

            let username = null;

            const direct =
                comment.match(/^@?([A-Za-z0-9_]{3,20})$/);

            if (direct) {

                username = direct[1];

            } else {

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

    connection.on(
        WebcastEvent.CONNECTED,
        state => {

            console.log(
                "TikTok conectado!"
            );

            console.log(
                "Room ID:",
                state.roomId
            );

        }
    );

    try {

        await connection.connect();

    } catch (error) {

        console.error(
            "Erro ao conectar no TikTok:"
        );

        console.error(error);

        setTimeout(
            connectTikTok,
            15000
        );

    }

}

// ===============================
// SERVIDOR
// ===============================

app.listen(
    PORT,
    () => {

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

        connectTikTok();

    }
);
