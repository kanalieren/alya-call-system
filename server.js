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

// ---- WebSocket Upgrade ----
app.server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ---- Core Voice Logic ----
wss.on("connection", async (ws) => {
  console.log("🔌 Twilio connected.");

  // OpenAI Realtime WebSocket
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
    console.log("🧠 Connected to OpenAI Realtime.");

    openAiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions: `
Senin adın Alya.
Sıcakkanlı, profesyonel, esprili ama argo kullanmayan bir asistansın.
Müşteriyle samimi konuş, randevu oluşturmaya odaklan.
          `,
          modalities: ["audio"],
        },
      })
    );
  });

  // ---- OpenAI → Twilio (AUDIO OUT) ----
  openAiWs.on("message", (data) => {
    try {
      const event = JSON.parse(data);

      // Doğru event: response.output_audio.delta
      if (event.type === "response.output_audio.delta") {
        ws.send(
          JSON.stringify({
            event: "media",
            media: {
              payload: event.audio_base64, // Twilio base64 bekler
            },
          })
        );
      }
    } catch (err) {
      console.log("OpenAI Parse Error:", err);
    }
  });

  // ---- Twilio → OpenAI (AUDIO IN) ----
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // Caller audio
    if (data.event === "media" && data.media?.payload) {
      openAiWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload, // Twilio base64 gönderiyor
        })
      );
    }

    if (data.event === "start") {
      openAiWs.send(JSON.stringify({ type: "response.create" }));
    }

    if (data.event === "stop") {
      openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio Disconnected.");
    openAiWs.close();
  });
});

// ---- Static Panel ----
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ---- Web Panel ----
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// ---- Outgoing Call Trigger ----
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

// ---- Twilio Answer ----
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
