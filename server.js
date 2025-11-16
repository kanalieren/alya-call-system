import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Twilio
const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// Path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// PANEL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// ---------------------------------------------------------
//  OUTBOUND CALL (Panel→ /call-customer)
// ---------------------------------------------------------
app.post("/call-customer", async (req, res) => {
  try {
    const { number } = req.body;

    if (!number) return res.json({ ok: false, error: "Numara alınamadı" });

    const call = await client.calls.create({
      url: process.env.TWILIO_ANSWER_URL, // ARTIK /call değil → /answer
      to: number,
      from: process.env.TWILIO_NUMBER,
    });

    res.json({ ok: true, sid: call.sid });

  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
//  TWILIO ANSWER → Twilio çağrı açılınca buraya gelir
// ---------------------------------------------------------
app.post("/answer", (req, res) => {
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://${process.env.PUBLIC_HOST}/twilio-stream" />
      </Connect>
    </Response>
  `;

  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

// ---------------------------------------------------------
//  WEBSOCKET SERVER — Twilio Stream'den ses alıyoruz
// ---------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log("Alya STREAM sistemi aktif →", PORT);
});

const wss = new WebSocketServer({ server, path: "/twilio-stream" });

wss.on("connection", (ws) => {
  console.log("📞 Twilio STREAM bağlandı!");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      console.log("🎬 Stream başladı:", data.start);
    }

    if (data.event === "media") {
      console.log("🎤 Ses paketi geldi (base64):", data.media.payload.substring(0, 30) + "...");
    }

    if (data.event === "stop") {
      console.log("⛔ Stream durdu");
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio STREAM bağlantısı kapandı");
  });
});
