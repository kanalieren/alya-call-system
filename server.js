import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// OpenAI API Key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Alya'nın OpenAI üzerinden konuşma oluşturduğu fonksiyon
async function generateSpeech(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts", 
        voice: "alloy",          // OpenAI'nin Türkçe konuşan sesi
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

    const audioBase64 = Buffer.from(response.data, "binary").toString("base64");
    return audioBase64;

  } catch (err) {
    console.error("OpenAI Speech Error:", err.response?.data || err);
    return null;
  }
}

// TEST endpoint
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// TWILIO CALL WEBHOOK
app.post("/call", async (req, res) => {
  const userSentence = req.body.SpeechResult || "Merhaba";

  // OpenAI'den konuşma cevabı al
  const aiResponse = await axios.post(
  "https://api.openai.com/v1/chat/completions",
  {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Sen Alya adında profesyonel bir arama asistanısın.
Türkçe konuşursun.
HER cevabın çok kısa olacak: maksimum 8-12 kelime.
Kısa cümleler kur. Uzun açıklamalar yapma.
Twilio'nun 64KB sınırı için ses çıktısını KÜÇÜK tut.
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
      "Content-Type": "application/json"
    }
  }
);


  const aiText = aiResponse.data.choices[0].message.content;

  // TTS oluştur
  const speechBase64 = await generateSpeech(aiText);

  const twimlResponse = `
    <Response>
      <Play>data:audio/mp3;base64,${speechBase64}</Play>
      <Gather input="speech" action="/call" method="POST"></Gather>
    </Response>
  `;

  res.type("text/xml");
  return res.send(twimlResponse);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Alya OpenAI Voice Sistemi Aktif →", PORT);
});
