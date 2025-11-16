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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Twilio Client ----
const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// ---- WebSocket Server ----
const wss = new WebSocketServer({ noServer: true });

// ---- Start HTTP Server ----
app.server = app.listen(PORT, () => {
  console.log("🚀 Alya Voice Server Active → PORT", PORT);
});

// ---- Upgrade Handler ----
app.server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ==========================================================
//                TWILIO MEDIA STREAM LOGIC
// ==========================================================

wss.on("connection", async (ws) => {
  console.log("🔌 Twilio connected to WebSocket stream.");

  // FIX: OpenAI WS durumu
  let openaiReady = false;
  let twilioQueue = [];

  // Connect to OpenAI Realtime WebSocket
  const openAiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  // ---------------------------------------------
  //           OPENAI RECONNECTED & READY
  // ---------------------------------------------
  openAiWs.on("open", () => {
    console.log("🧠 OpenAI Realtime ready.");
    openaiReady = true;

    // Alya personality
    const intro = JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio"],
        instructions: `
Senin adın Alya.
Sıcakkanlı, samimi, profesyonel ve esprili bir Türkçe çağrı asistanısın.
Doğal konuş, kısa cevap ver, argo kullanma.
Müşteriyi randevuya yönlendir.
`
      }
    });

    openAiWs.send(intro);

    // Twilio’dan erken gelen tüm mesajları gönder
    for (const buffered of twilioQueue) {
      openAiWs.send(buffered);
    }
    twilioQueue = [];
  });

  // ---------------------------------------------
  //        OPENAI → TWILIO (AUDIO OUTPUT)
  // ---------------------------------------------
  openAiWs.on("message", (data) => {
    try {
      const json = JSON.parse(data);

      if (json.type === "response.output_audio.delta") {
        ws.send(
          JSON.stringify({
            event: "media",
            media: {
              payload: json.audio_base64, // Twilio accepted audio
            },
          })
        );
      }
    } catch (err) {
      console.log("❗ OpenAI JSON parse error:", err);
    }
  });

  // ---------------------------------------------
  //        TWILIO → OPENAI (AUDIO INPUT)
  // ---------------------------------------------
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // ---- MEDIA (audio packet) ----
    if (data.event === "media") {
      const payload = JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload,
      });

      if (openaiReady) openAiWs.send(payload);
      else twilioQueue.push(payload);
    }

    // ---- STREAM START ----
    if (data.event === "start") {
      console.log("📞 Twilio stream started.");
      const startMsg = JSON.stringify({ type: "response.create" });

      if (openaiReady) openAiWs.send(startMsg);
      else twilioQueue.push(startMsg);
    }

    // ---- STREAM STOP ----
    if (data.event === "stop") {
      console.log("📞 Twilio stream stopped.");
      const stopMsg = JSON.stringify({ type: "input_audio_buffer.commit" });

      if (openaiReady) openAiWs.send(stopMsg);
      else twilioQueue.push(stopMsg);
    }
  });

  // ---- WebSocket close cleanup ----
  ws.on("close", () => {
    console.log("❌ Twilio disconnected.");
    openAiWs.close();
  });
});

// ==========================================================
//                   STATIC PANEL + API
// ==========================================================

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// ==========================================================
//                OUTBOUND CALL TRIGGER
// ==========================================================

app.post("/call-customer", async (req, res) => {
  try {
    const { number } = req.body;

    const call = await client.calls.create({
      url: process.env.TWILIO_VOICE_URL,
      to: number,
      from: process.env.TWILIO_NUMBER,
    });

    return res.json({ ok: true, sid: call.sid });
  } catch (e) {
    console.error("TWILIO CALL ERROR:", e.message);
    return res.json({ ok: false, error: e.message });
  }
});

// ==========================================================
//                TWIML ENDPOINTS (CALL + ANSWER)
// ==========================================================

function createTwiml(host) {
  return `
    <Response>
      <Connect>
        <Stream url="wss://${host}/ws" />
      </Connect>
    </Response>
  `;
}

// Twilio should hit here
app.post("/answer", (req, res) => {
  const xml = createTwiml(req.headers.host);
  res.set("Content-Type", "text/xml");
  res.send(xml);
});

// Twilio cached "old" URL fallback
app.post("/call", (req, res) => {
  const xml = createTwiml(req.headers.host);
  res.set("Content-Type", "text/xml");
  res.send(xml);
});

console.log("✔ Server.js fully loaded.");
