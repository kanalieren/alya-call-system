import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;

// Twilio client
const client = twilio(TWILIO_SID, TWILIO_AUTH);

// ---------------------------------------------------------
// 1) OPENAI TTS (Metinden ses üretme)
// ---------------------------------------------------------
async function generateSpeech(text) {
  try {
    console.log("[Alya] TTS isteği gönderiliyor...");

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

    console.log("[Alya] TTS üretildi.");
    return Buffer.from(response.data, "binary").toString("base64");

  } catch (err) {
    console.error("[Alya] TTS HATASI:", err);
    return null;
  }
}

// ---------------------------------------------------------
// 2) Ana konuşma Webhook (/call) – inbound + outbound aynı
// ---------------------------------------------------------
app.post("/call", async (req, res) => {
  try {
    const speech = req.body.SpeechResult || "Merhaba";

    console.log("[Alya] Kullanıcı konuşması:", speech);

    // GPT Cevabı
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya isimli profesyonel bir çağrı karşılama ve randevu asistanısın.
Türkçe konuşursun. Cevapların 6-10 kelimeyi geçmez.
Doğrudan konuya gir. 
Amaç: müşteriden randevu almak ve sohbeti kısa tutmak.
`
          },
          {
            role: "user",
            content: speech
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

    const aiText = aiRes.data.choices[0].message.content;
    console.log("[Alya GPT Yanıtı]:", aiText);

    const audioBase64 = await generateSpeech(aiText);
    if (!audioBase64) {
      return res.send(`
        <Response>
          <Say>Sunucu hatası oluştu.</Say>
        </Response>
      `);
    }

    const twimlResponse = `
      <Response>
        <Play>data:audio/wav;base64,${audioBase64}</Play>
        <Gather input="speech" action="/call" method="POST" speechTimeout="auto"></Gather>
      </Response>
    `;

    res.type("text/xml");
    return res.send(twimlResponse);

  } catch (err) {
    console.error("[Alya] Webhook Hatası:", err);
    return res.send(`
      <Response>
        <Say>Bir hata meydana geldi.</Say>
      </Response>
    `);
  }
});

// ---------------------------------------------------------
// 3) OUTBOUND CUSTOMERS — Müşteriyi Biz Arıyoruz
// ---------------------------------------------------------
app.post("/call-customer", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Telefon numarası eksik." });
    }

    console.log("📞 OUTBOUND ARAMA BAŞLIYOR ->", phone);

    const call = await client.calls.create({
      to: phone,
      from: "+905302511091",   // ☑ SENDEN GÖRÜNEN CALLER ID (Verified)
      url: "https://alya-call-system.onrender.com/call"
    });

    return res.json({ ok: true, callSid: call.sid });

  } catch (err) {
    console.error("OUTBOUND CALL ERROR:", err);
    return res.status(500).json({ error: "Arama başlatılamadı." });
  }
});

// ---------------------------------------------------------
// 4) TEST ENDPOINT
// ---------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Alya çağrı sistemi aktif ✔");
});

// ---------------------------------------------------------
// 5) SERVER PORT
// ---------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Alya OpenAI Voice Sistemi Aktif →", PORT);
});
