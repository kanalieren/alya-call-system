import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// STATIC PANEL SERVE
app.use(express.static(__dirname + "/public"));


const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;
const TWILIO_PHONE = process.env.TWILIO_PHONE;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// ---------------------------------------------
// OPENAI TTS
// ---------------------------------------------
async function generateSpeech(text) {
  try {
    console.log("[Alya] Ses oluşturuluyor...");

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
        format: "wav"
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    return Buffer.from(response.data).toString("base64");

  } catch (err) {
    console.error("[Alya] Ses hatası:", err);
    return null;
  }
}

// ---------------------------------------------
// TWILIO /call WEBHOOK
// ---------------------------------------------
app.post("/call", async (req, res) => {
  try {
    const customerSpeech = req.body.SpeechResult || "";

    console.log("[Müşteri]:", customerSpeech);

    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya adında sıcak, kadınsı, profesyonel bir satış asistanısın.
Konuşmaların kısa ve net olsun.
`
          },
          {
            role: "user",
            content: customerSpeech
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const alyaReply = aiRes.data.choices[0].message.content;
    const audioBase64 = await generateSpeech(alyaReply);

    if (!audioBase64) {
      return res.send(`<Response><Say>Hata oluştu.</Say></Response>`);
    }

    const twiml = `
      <Response>
        <Play>data:audio/wav;base64,${audioBase64}</Play>
        <Gather input="speech" action="/call" method="POST" speechTimeout="auto" />
      </Response>
    `;

    res.type("text/xml");
    res.send(twiml);

  } catch (err) {
    console.error("CALL HATASI:", err);
    res.type("text/xml");
    res.send(`<Response><Say>Sunucu hatası oluştu.</Say></Response>`);
  }
});

// ---------------------------------------------
// OUTBOUND ARAMA
// ---------------------------------------------
app.post("/call-customer", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ ok: false, error: "Telefon numarası gerekli." });
    }

    const call = await client.calls.create({
      to: phone,
      from: TWILIO_PHONE, // ← doğru numara buraya bağlandı
      url: "https://alya-call-system.onrender.com/call"
    });

    res.json({ ok: true, callSid: call.sid });

  } catch (err) {
    console.error("OUTBOUND CALL ERROR:", err);
    console.log("Detay:", err.message);
    res.status(500).json({ ok: false, error: "Arama başlatılamadı." });
  }
});

// ---------------------------------------------
app.get("/", (req, res) => res.send("Alya sistemi aktif ✔"));
// ---------------------------------------------

// ⭐ DOĞRU PORT ⭐
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Alya çalışıyor → PORT ${PORT}`);
});
