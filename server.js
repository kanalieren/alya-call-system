import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// TTS fonksiyonu
async function generateSpeech(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        format: "mp3",   // 🔥 CRITICAL — Twilio MP3 çalar
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

    return Buffer.from(response.data, "binary").toString("base64");
  } catch (err) {
    console.error("TTS ERROR:", err.response?.data || err);
    return null;
  }
}

// Test endpoint
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// TWILIO CALL WEBHOOK
app.post("/call", async (req, res) => {
  console.log("[Alya] Yeni çağrı geldi.");
  console.log(req.body);

  const userSentence = req.body.SpeechResult || "Merhaba";

  // ChatGPT cevabı
  const aiResponse = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Kısa konuş. 8-12 kelime.
Profesyonel arama asistanısın.
Türkçe konuş.
Randevu almaya odaklan.
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
    }
  );

  const aiText = aiResponse.data.choices[0].message.content;
  console.log("[Alya GPT Yanıtı]:", aiText);

  const speechBase64 = await generateSpeech(aiText);

  if (!speechBase64) {
    return res.send(`
      <Response>
        <Say>Sunucu hatası oluştu.</Say>
      </Response>
    `);
  }

  const twiml = `
    <Response>
      <Play>data:audio/mp3;base64,${speechBase64}</Play>
      <Gather input="speech" action="/call" method="POST" speechTimeout="auto"></Gather>
    </Response>
  `;

  res.type("text/xml");
  res.send(twiml);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Alya Voice Ready →", PORT));
