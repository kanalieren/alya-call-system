import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ========== LOG SYSTEM ==========
function log(...msg) {
  console.log("[Alya]", ...msg);
}

// ========== TTS OLUŞTUR ==========
async function generateSpeech(text) {
  try {
    log("TTS isteği gönderiliyor:", text);

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 20000,
      }
    );

    log("TTS başarılı.");
    return Buffer.from(response.data).toString("base64");
  } catch (err) {
    log("❌ TTS HATASI:", err.response?.data || err.message);
    return null;
  }
}

// ========== CHATGPT CEVABI AL ==========
async function getAIResponse(userSentence) {
  try {
    log("ChatGPT isteği:", userSentence);

    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya adında profesyonel bir arama asistanısın.
Kısa konuşursun (maks 8-12 kelime).
Uzun cümle kurma. Direkt yanıt ver.
Müşteriden randevu almaya odaklan.
            `,
          },
          {
            role: "user",
            content: userSentence,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const text = aiResponse.data.choices[0].message.content;
    log("ChatGPT yanıtı:", text);

    return text;
  } catch (err) {
    log("❌ ChatGPT HATASI:", err.response?.data || err.message);
    return "Şu anda sistemde hata oluştu.";
  }
}

// ========== TEST ==========
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// ========== TWILIO WEBHOOK ==========
app.post("/call", async (req, res) => {
  log("📞 Yeni çağrı geldi.");
  log("Twilio Body:", req.body);

  const userSentence = req.body.SpeechResult || "Merhaba, kimsiniz?";
  log("Kullanıcı konuşması:", userSentence);

  // --- ChatGPT cevabı al ---
  const aiText = await getAIResponse(userSentence);

  // --- TTS oluştur ---
  const speechBase64 = await generateSpeech(aiText);

  if (!speechBase64) {
    log("❌ Ses oluşturulamadı, Twilio'ya fallback XML dönülüyor.");
    res.type("text/xml");
    return res.send(`
      <Response>
        <Say>Sunucu hatası oluştu.</Say>
      </Response>
    `);
  }

  // --- Twilio XML ---
  const twiml = `
    <Response>
      <Play>data:audio/mp3;base64,${speechBase64}</Play>
      <Gather input="speech" action="/call" method="POST"></Gather>
    </Response>
  `;

  log("Twilio'ya yanıt gönderiliyor...");
  res.type("text/xml");
  res.send(twiml);
});

// ========== SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log("Alya OpenAI Voice Sistemi Aktif →", PORT);
});
