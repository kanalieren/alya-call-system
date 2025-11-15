import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// OpenAI API Key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// === TTS ÜRETİCİ FONKSİYON ===
async function generateSpeech(text) {
  try {
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
      }
    );

    return Buffer.from(response.data).toString("base64");

  } catch (err) {
    console.error("OpenAI Speech Error:", err.response?.data || err);
    return null;
  }
}

// === TEST ===
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// === TWILIO WEBHOOK ===
app.post("/call", async (req, res) => {
  const userSentence = req.body.SpeechResult || "Merhaba";

  // CHAT RESPONSE
  let aiResponse;
  try {
    aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya adında profesyonel bir arama asistanısın.
Türkçe konuşursun.
HER cevap maksimum 8-12 kelime olacak.
Kısa cümleler kur. Uzun açıklamalar yapma.
Twilio 64KB sınırı için SES ÇIKTISINI KÜÇÜK tut.
Doğrudan konuya gir.
Müşteriden randevu almaya odaklan.
`
          },
          {
            role: "user",
            content: userSentence
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.log("OpenAI Chat Error:", err.response?.data || err);
    return res.send("<Response><Say>Sunucu hatası oluştu.</Say></Response>");
  }

  const aiText = aiResponse.data.choices[0].message.content.trim();

  // === TTS OLUŞTUR ===
  const speechBase64 = await generateSpeech(aiText);

  if (!speechBase64) {
    return res.send("<Response><Say>Ses oluşturulamadı.</Say></Response>");
  }

  // === TWIML ===
  const twiml = `
    <Response>
      <Play>data:audio/mp3;base64,${speechBase64}</Play>
      <Gather input="speech" action="/call" method="POST"></Gather>
    </Response>
  `;

  res.type("text/xml");
  res.send(twiml);
});

// === SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Alya OpenAI Voice Sistemi Aktif →", PORT);
});
