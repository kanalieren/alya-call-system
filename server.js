// -----------------------------
// Alya Call System - Final Version
// -----------------------------

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ENV KEYS
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// -----------------------------
// OPENAI TTS - Alya Kadın Sesi
// -----------------------------
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

// -----------------------------
// OPENAI CHAT – Alya'nın Konuşması
// -----------------------------
async function alyaAnswer(customerText) {
  console.log("[Müşteri]:", customerText);

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Sen Alya adında sıcak, kadınsı, profesyonel bir satış asistanısın.
Pronet adına iş yerlerini arıyorsun.

Her konuşmada amacın:
1) Randevu almak
2) Randevu alınca şu soruları sormak:
   - Adınız neydi?
   - Alarm veya kamera sisteminiz var mı?
   - Karar verici siz misiniz, ortak var mı?
   - Randevuda uzmanımız sizinle mi görüşecek?

KURALLAR:
• Cevapları kısa tut (8-12 kelime)
• Çok samimi ol ama profesyonelliği bozma
• Fiyat verme
• Konu dışına çıkma
• Müşteri konuşmazsa yönlendirici sorular sor
        `
        },
        {
          role: "user",
          content: customerText
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

  return response.data.choices[0].message.content;
}

// -----------------------------
// TWILIO /call WEBHOOK
// -----------------------------
app.post("/call", async (req, res) => {
  try {
    const customerSpeech = req.body.SpeechResult || "";

    const alyaReply = await alyaAnswer(customerSpeech);
    console.log("[Alya]:", alyaReply);

    const audioBase64 = await generateSpeech(alyaReply);

    if (!audioBase64) {
      res.type("text/xml");
      return res.send(`<Response><Say>Bir hata oluştu.</Say></Response>`);
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
    console.error("CALL ERROR:", err);
    res.type("text/xml");
    res.send(`<Response><Say>Sunucu hatası oluştu.</Say></Response>`);
  }
});

// -----------------------------
// OUTBOUND CALL – Alya arama başlatır
// -----------------------------
app.post("/call-customer", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Telefon numarası gerekli." });
    }

    console.log("OUTBOUND ARAMA →", phone);

    const call = await client.calls.create({
      to: phone,
      from: "+905302511091", // Verified Caller ID
      url: "https://alya-call-system.onrender.com/call"
    });

    res.json({ ok: true, callSid: call.sid });

  } catch (err) {
    console.error("OUTBOUND CALL ERROR:", err);
    res.status(500).json({ error: "Arama başlatılamadı" });
  }
});

// -----------------------------
// ROOT ENDPOINT
// -----------------------------
app.get("/", (req, res) => {
  res.send("Alya sistemi aktif ✔ (Render PORT kullanıyor)");
});

// -----------------------------
// PORT → Render'ın verdiği port KESİNLİKLE kullanılacak
// -----------------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Alya OpenAI – Twilio sistemi çalışıyor → PORT ${PORT}`);
});
