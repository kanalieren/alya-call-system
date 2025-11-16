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

// ---- Start Server ----
app.server = app.listen(PORT, () => {
  console.log("🚀 Alya Voice Server Active → PORT", PORT);
});

// ---- Upgrade Handler for Twilio Streams ----
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
//      ALYA AI LOGIC
// =========================

wss.on("connection", async (ws) => {
  console.log("🔌 Twilio connected to WS.");

  // Connect to OpenAI Realtime API
  const openAiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      }
    }
  );

  openAiWs.on("open", () => {
    console.log("🧠 OpenAI Realtime WebSocket Connected.");

    // Alya's initial personality / instructions
    openAiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: `
Senin adın Alya.
Sıcakkanlı, samimi, profesyonel ve espirili bir Türkçe çağrı asistanısın.
Arayan kişinin cümlelerini doğal bir şekilde anla.
Argo kullanma.
Kısa ve net konuş.
Randevu oluşturmaya odaklan.
`
        }
      })
    );
  });

  // ---- OpenAI ---> Twilio (Audio Out) ----
  openAiWs.on("message", (data) => {
    try {
      const event = JSON.parse(data);

      // Doğru realtime event formatı
      if (event.type === "response.output_audio.delta") {
        ws.send(
          JSON.stringify({
            event: "media",
            media: {
              payload: event.audio_base64 // Twilio expected base64 audio
            }
          })
        );
      }
    } catch (err) {
      console.log("OpenAI JSON error:", err);
    }
  });

  // ---- Twilio ---> OpenAI (Audio In) ----
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      // Caller audio → OpenAI
      openAiWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload  // Twilio base64 audio
        })
      );
    }

    if (data.event === "start") {
      console.log("📞 Twilio Stream started.");
      openAiWs.send(JSON.stringify({ type: "response.create" }));
    }

    if (data.event === "stop") {
      console.log("📞 Twilio Stream stopped.");
      openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio disconnected.");
    openAiWs.close();
  });
});

// Static UI
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Panel
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// API: Trigger call
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
    return res.json({ ok: false, error: e.message });
  }
});

// Twilio Answer URL
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

console.log("✔ Server.js fully loaded.");
