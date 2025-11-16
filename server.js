import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";
import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Twilio Client ----
const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// ---- OpenAI Client ----
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---- WebSocket Server ----
const wss = new WebSocketServer({ noServer: true });

let openAiWs = null;

// ---- WebSocket Upgrade ----
app.server = app.listen(PORT, () => {
  console.log("🚀 Alya OpenAI Voice Sistemi aktif → PORT", PORT);
});

app.server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ---- WebSocket: Twilio <-> OpenAI bağlantısı ----
wss.on("connection", async (ws) => {
  console.log("🔌 Twilio bağlandı.");

  // OpenAI WebSocket’e bağlan
  openAiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  // OpenAI bağlanınca başlangıç mesajı gönder
  openAiWs.on("open", () => {
    console.log("🧠 OpenAI Realtime bağlı.");

    openAiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions: `
Senin adın **Alya**.  
Sıcak kanlı, samimi, profesyonel ve espirili bir asistansın.  
Müşteriyle doğal konuş, argo kullanma.  
Randevu oluşturmaya odaklan. 
        `,
        modalities: ["audio"],
        audio_format: "pcm16",
      })
    );
  });

  // OpenAI’den gelen sesi → Twilio’ya gönder
  openAiWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === "response.audio.delta") {
        ws.send(
          JSON.stringify({
            event: "media",
            media: { payload: msg.delta },
          })
        );
      }
    } catch {}
  });

  // Twilio’dan gelen ses → OpenAI’ye gönder
  ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.event === "media") {
      openAiWs?.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        })
      );
    }

    if (msg.event === "start") {
      openAiWs?.send(JSON.stringify({ type: "response.create" }));
    }

    if (msg.event === "stop") {
      openAiWs?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio bağlantısı kapandı.");
    openAiWs?.close();
  });
});

// ---- PUBLIC ----
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ---- Panel ----
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// ---- Caller starts call ----
app.post("/call-customer", async (req, res) => {
  try {
    const { number } = req.body;

    const call = await client.calls.create({
      url: process.env.TWILIO_VOICE_URL, // /answer
      to: number,
      from: process.env.TWILIO_NUMBER,
    });

    return res.json({ ok: true, sid: call.sid });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

// ---- Twilio Answer (TwiML) ----
// Bu endpoint sadece 1 KB’den küçük XML döner → güvenli
app.post("/answer", (req, res) => {
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://${req.headers.host}/ws" />
      </Connect>
    </Response>
  `;

  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

console.log("✔ Server loaded successfully.");
