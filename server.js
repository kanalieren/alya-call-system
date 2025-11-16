import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";
import WebSocket, { WebSocketServer } from "ws";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Twilio client
const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// Path ayarları
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Public klasörü
app.use(express.static(path.join(__dirname, "public")));

// Panel
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "panel.html"));
});

/* ----------------------------------------------------
   🟣 1) Telefon Aramasını Başlatma
---------------------------------------------------- */
app.post("/call-customer", async (req, res) => {
    try {
        const { number } = req.body;

        if (!number) {
            return res.json({ ok: false, error: "Numara alınamadı." });
        }

        const call = await client.calls.create({
            url: process.env.TWILIO_VOICE_URL,
            to: number,
            from: process.env.TWILIO_NUMBER,
        });

        res.json({ ok: true, callSID: call.sid });

    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

/* ----------------------------------------------------
   🟣 2) Twilio Çağrı Başlangıcı — STREAM başlat
---------------------------------------------------- */
app.post("/answer", (req, res) => {
    const twiml = `
        <Response>
            <Connect>
                <Stream url="${process.env.STREAM_URL}" />
            </Connect>
        </Response>
    `;

    res.set("Content-Type", "text/xml");
    res.send(twiml);
});

/* ----------------------------------------------------
   🟣 3) WebSocket Sunucusu (AI Ses Motoru)
---------------------------------------------------- */
const wss = new WebSocketServer({ noServer: true });

/*
   Gelen bağlantıları kabul et
*/
wss.on("connection", (ws) => {
    console.log("🔗 Yeni STREAM bağlantısı (Twilio bağlandı)");

    ws.on("message", async (msg) => {
        const data = JSON.parse(msg);

        // Twilio ses paketleri
        if (data.event === "media") {
            // base64 ses paketini elde edersin
            const audioBase64 = data.media.payload;

            // Burada AI modeline sesi gönderebilirsin
            // Şimdilik sadece debug yazıyoruz
            console.log("🎤 Ses paketi geldi...");
        }

        // STREAM başladı
        if (data.event === "start") {
            console.log("🚀 Twilio STREAM başladı:", data.start.callSid);
        }

        // STREAM bitti
        if (data.event === "stop") {
            console.log("⛔ STREAM durdu");
        }
    });

    // Örnek: AI yanıtı olarak Twilio'ya TTS gönderme (isteğe bağlı)
    // Twilio'ya ses geri göndermek:
    // ws.send(JSON.stringify({
    //    event: "media",
    //    media: { payload: BASE64_AUDIO }
    // }));
});

/* ----------------------------------------------------
   🟣 4) HTTP → WebSocket Upgrade
---------------------------------------------------- */
const server = app.listen(PORT, () => {
    console.log("Alya sistemi çalışıyor → PORT", PORT);
});

server.on("upgrade", (req, socket, head) => {
    if (req.url === "/media") {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    } else {
        socket.destroy();
    }
});
