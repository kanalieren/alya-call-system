import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// OpenAI API Key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// =============== TTS FONKSİYONU (Twilio için WAV formatında) ===============
async function generateSpeech(text) {
  try {
    console.log("[Alya] TTS isteği gönderiliyor...");

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
        format: "wav" // <<< Twilio için kritik
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    console.log("[Alya] TTS başarıyla üretildi.");

    // WAV çıktısını Base64'e çevir
    return Buffer.from(response.data).toString("base64");

  } catch (err) {
    console.error("[Alya] TTS HATASI:", err.response?.data || err);
    return null;
  }
}

// =============== TEST ENDPOINT ===============
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// =============== TWILIO CALL WEBHOOK ===============
app.post("/call", async (req, res) => {
  console.log("\n🔔 Yeni çağrı geldi.");
  console.log("[DEBUG] Twilio Body:", req.body);

  const userSentence = req.body.SpeechResult || req.body.speechResult || "Merhaba";
  console.log("[Alya] Kullanıcı konuşması:", userSentence);

  // 1️⃣ OpenAI'den cevap al
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
HER cevabın çok kısa olacak: maksimum 8-12 kelime.
Kısa cümle kur. Uzun açıklama yapma.
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
  } catch (err) {
    console.error("[Alya] ChatGPT isteği HATASI:", err.response?.data || err);
    return res.send(`
      <Response>
        <Say>Sunucu hatası oluştu.</Say>
      </Response>
    `);
  }

  const aiText = aiResponse.data.choices[0].message.content;
  console.log("[Alya] ChatGPT yanıtı:", aiText);

  // 2️⃣ TTS oluştur
  const speechBase64 = await generateSpeech(aiText);

  if (!speechBase64) {
    console.log("[Alya] TTS üretilemedi → Twilio'ya hata döndürüyoruz.");
    return res.send(`
      <Response>
        <Say>Sunucu hatası oluştu.</Say>
      </Response>
    `);
  }

  // 3️⃣ TWILIO'YA SESİ YOLLA
  console.log("[Alya] Twilio'ya yanıt gönderiliyor...");

  const twimlResponse = `
    <Response>
      <Play>data:audio/wav;base64,${speechBase64}</Play>
      <Gather input="speech" action="/call" method="POST" speechTimeout="auto"></Gather>
    </Response>
  `;

  res.type("text/xml");
  return res.send(twimlResponse);
});

// =============== SERVER BAŞLATMA ===============
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`\n[Alya] OpenAI Voice Sistemi Aktif → ${PORT}\n`);
});
