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

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// ---------------------------------------------------------
// 1) OPENAI TTS (Kadın sesi üretimi)
// ---------------------------------------------------------
async function generateSpeech(text) {
  try {
    console.log("[Alya] TTS oluşturuluyor...");

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

    return Buffer.from(response.data, "binary").toString("base64");

  } catch (err) {
    console.error("[Alya] TTS HATASI:", err);
    return null;
  }
}

// ---------------------------------------------------------
// 2) Alya Konuşma Webhook (/call)
// ---------------------------------------------------------
app.post("/call", async (req, res) => {
  try {
    const speech = req.body.SpeechResult || "Merhaba";
    console.log("[Müşteri konuştu]:", speech);

    // GPT asistan cevabı
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya isimli kadın bir dijital satış asistanısın.
Pronet güvenlik hizmetleri adına arama yapıyorsun.
Tonun kadınsı, sıcak, profesyonel ve güven vericidir.
Her cümlen kısa, net ve akıcıdır. 8–12 kelime arasında konuşursun.

Görevlerin:
- Müşteriyi nazikçe karşılamak.
- Alieren Bey’in dijital asistanı olduğunu söylemek.
- Güvenlik sistemi için ücretsiz keşif randevusu önermek.
- Uzun konuşmadan kaçınmak, doğrudan randevuya yönlendirmek.
- İtirazları nazikçe kırmak ve yumuşak bir şekilde randevuya taşımak.
- Fiyat söylememek, kampanya uydurmamak, yanlış bilgi vermemek.
- Samimi ama profesyonel bir kadın ses tonu kullanmak.

Direnç kırıcı cevap örnekleri:
- “Tabii ki, sadece kısa bir bilgilendirme yapıyoruz.”
- “Keşif tamamen ücretsiz, karar vermeniz gerekmiyor.”
- “Anlıyorum, süreç çok kısa, sizin için uygun bir zaman belirleyebiliriz.”
- “Birçok kişi önce ihtiyaç olmadığını düşünüyor ama uzmanımız netleştiriyor.”

Amacın net: müşterinin uygun bir gün ve saat söylemesini sağlamak.
Cümleler her zaman kısa, sıcak ve net olsun.
`
          },
          { role: "user", content: speech }
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
    console.log("[Alya]:", aiText);

    // TTS oluştur
    const audioBase64 = await generateSpeech(aiText);
    if (!audioBase64) {
      return res.send(`<Response><Say>Sunucu hatası oluştu.</Say></Response>`);
    }

    const twimlResponse = `
      <Response>
        <Play>data:audio/wav;base64,${audioBase64}</Play>
        <Gather input="speech" method="POST" action="/call" speechTimeout="auto" />
      </Response>
    `;

    res.type("text/xml");
    res.send(twimlResponse);

  } catch (err) {
    console.error("[Alya] WEBHOOK HATASI:", err);
    res.send(`<Response><Say>Bir hata oluştu.</Say></Response>`);
  }
});

// ---------------------------------------------------------
// 3) OUTBOUND: Alya müşteriyi arıyor
// ---------------------------------------------------------
app.post("/call-customer", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) return res.status(400).json({ error: "Telefon numarası eksik." });

    console.log("📞 OUTBOUND ARAMA BAŞLIYOR ->", phone);

    const call = await client.calls.create({
      to: phone,
      from: "+905302511091",   // SENİN VERIFIED NUMARAN
      url: "https://alya-call-system.onrender.com/call"
    });

    res.json({ ok: true, callSid: call.sid });

  } catch (err) {
    console.error("OUTBOUND CALL ERROR:", err);
    res.status(500).json({ error: "Arama başlatılamadı." });
  }
});

// ---------------------------------------------------------
// 4) Test endpoint
// ---------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Alya çağrı sistemi aktif ✔");
});

// ---------------------------------------------------------
// 5) PORT
// ---------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Alya OpenAI Voice Sistemi Aktif → PORT:", PORT);
});
