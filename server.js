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

// =========================
//       TWILIO STREAM
// =========================

wss.on("connection", async (ws) => {
  console.log("🔌 Twilio connected to WebSocket stream.");

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

  openAiWs.on("open", () => {
    console.log("🧠 Connected to OpenAI Realtime API.");

    // Alya's personality
    openAiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: `
Senin adın Alya.
Sıcakkanlı, profesyonel, samimi ve esprili bir Türkçe çağrı asistanısın.
Karşı tarafla doğal ve kısa cümlelerle konuş.
Argo kullanma.
Müşteriyi randevuya yönlendirmeye odaklan.
`
        },
      })
    );
  });

  // ---- OpenAI → Twilio (Audio Output) ----
  openAiWs.on("message", (data) => {
    try {
      const json = JSON.parse(data);

      if (json.type === "response.output_audio.delta") {
        ws.send(
          JSON.stringify({
            event: "media",
            media: {
              payload: json.audio_base64, // Twilio expects base64 audio
            },
          })
        );
      }
    } catch (err) {
      console.log("❗ OpenAI JSON parse error:", err);
    }
  });

  // ---- Twilio → OpenAI (Audio Input) ----
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      openAiWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload, // base64 audio from Twilio
        })
      );
    }

    if (data.event === "start") {
      console.log("📞 Twilio stream started.");
      openAiWs.send(JSON.stringify({ type: "response.create" }));
    }

    if (data.event === "stop") {
      console.log("📞 Twilio stream stopped.");
      openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio disconnected.");
    openAiWs.close();
  });
});

// =========================
//        STATIC FILES
// =========================

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// =========================
//   OUTBOUND CALL TRIGGER
// =========================

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

// =========================
//     TWIML ENDPOINTS
// =========================

// TwiML factory
function createTwiml(host) {
  return `
    <Response>
      <Connect>
        <Stream url="wss://${host}/ws" />
      </Connect>
    </Response>
  `;
}

// Primary correct endpoint
app.post("/answer", (req, res) => {
  const twiml = createTwiml(req.headers.host);
  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

// Backup endpoint (Twilio bazen eski URL'i cache'ler → çözüyoruz)
app.post("/call", (req, res) => {
  const twiml = createTwiml(req.headers.host);
  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

console.log("✔ Server.js fully loaded.");
