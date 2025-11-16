import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Twilio client
const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// Path ayarları
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// =======================
//  OpenAI yardımcıları
// =======================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("⚠ OPENAI_API_KEY tanımlı değil! .env / Render ENV kontrol et.");
}

// Alya’nın karakterini tanımlayan system prompt
const ALYA_SYSTEM_PROMPT = `
Sen Alya adında sıcak kanlı, samimi ama profesyonel bir satış asistanısın.
Pronet adına iş yerlerini arıyorsun. Alarm ve kamera sistemleri hakkında konuşuyorsun.
Özelliklerin:
- Sıcakkanlısın, güler yüzlü konuşursun.
- Argo kullanmazsın ama hafif, tatlı espiriler yapabilirsin.
- Konuşurken gereksiz uzatmazsın, cevabın en fazla 1 kısa cümle (10–15 kelime) olur.
- Amaç: RANDEVU almak. Her zaman konuşmayı randevuya bağlamaya çalış.
- Müşteriye “size özel çözümler”, “işletmenizin güvenliği” gibi ifadelerle güven ver.
- Fiyat verme, teknik detaya girme; “uzmanımız yüz yüze daha detaylı anlatacak” de.
- Konuşmanın sonunda gerekirse şu soruları sorarak randevuyu netleştir:
  1) Sizinle nasıl hitap edebilirim, adınız neydi?
  2) Şu anda alarm veya kamera sisteminiz var mı?
  3) Kararı siz mi veriyorsunuz, yoksa ortak/iş ortağı var mı?
  4) Uzmanımız geldiğinde sizinle birebir mi görüşecek?
Cevapların KISA, net, samimi ve randevu odaklı olsun.
`;

// OpenAI'den Alya cevabı alan fonksiyon
async function generateAlyaReply(userText) {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: ALYA_SYSTEM_PROMPT },
          { role: "user", content: userText || "Müşteri henüz bir şey söylemedi." },
        ],
        max_tokens: 80,
        temperature: 0.7,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("OpenAI Chat Hatası:", data);
      return "Şu anda teknik bir sorun yaşıyorum, birazdan tekrar arayacağım.";
    }

    const aiText = data.choices?.[0]?.message?.content?.trim();
    return aiText || "Size yardımcı olmak isterim, isterseniz bir randevu oluşturalım.";
  } catch (err) {
    console.error("OpenAI Chat İstek Hatası:", err);
    return "Küçük bir teknik aksaklık oldu, birazdan tekrar arayacağım.";
  }
}

// Alya'nın metnini alloy sesiyle ses dosyasına çeviren fonksiyon
async function textToSpeechBase64(text) {
  try {
    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
        format: "mp3",
      }),
    });

    if (!resp.ok) {
      const errData = await resp.text();
      console.error("OpenAI TTS Hatası:", errData);
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");
    return base64Audio;
  } catch (err) {
    console.error("OpenAI TTS İstek Hatası:", err);
    return null;
  }
}

// =======================
//  PANEL (WEB ARAYÜZÜ)
// =======================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// Panelden tetiklenen dış arama
app.post("/call-customer", async (req, res) => {
  try {
    const { number } = req.body;

    if (!number) {
      return res.json({ ok: false, error: "Numara alınamadı." });
    }

    // Eğer TWILIO_VOICE_URL tanımlıysa onu kullan, yoksa otomatik /call endpoint'i
    const voiceUrl =
      process.env.TWILIO_VOICE_URL ||
      `https://${process.env.PUBLIC_HOST || "alya-call-system.onrender.com"}/call`;

    const call = await client.calls.create({
      url: voiceUrl,
      to: number,
      from: process.env.TWILIO_NUMBER,
    });

    res.json({ ok: true, callSID: call.sid });
  } catch (err) {
    console.error("OUTBOUND CALL HATASI:", err);
    res.json({ ok: false, error: err.message });
  }
});

// =======================
//  TWILIO /call WEBHOOK
// =======================
// Twilio, <Gather input="speech"> ile konuşmayı metne çevirip buraya POST eder.
// İlk gelişte SpeechResult boş olabilir: o zaman Alya kendini tanıtıp konuşmaya başlar.
// Sonraki turlarda müşteri cevabına göre OpenAI'den yeni yanıt alınır.
app.post("/call", async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult || "";
    const isInitial = !speechResult; // İlk kez /call'e gelmiş mi?

    console.log("🔊 Twilio SpeechResult:", speechResult);

    let alyaText;

    if (isInitial) {
      // İlk açılış repliği — ister sabit, ister OpenAI'den
      alyaText =
        "Merhaba, ben Alya. Pronet güvenlik hizmetlerinden arıyorum. İşletmenizin güvenliğiyle ilgili size özel bir görüşme ayarlamak isterim. Bir dakikanızı alabilir miyim?";
    } else {
      // Müşteri cevabına göre OpenAI'den yanıt al
      alyaText = await generateAlyaReply(speechResult);
    }

    const audioBase64 = await textToSpeechBase64(alyaText);

    if (!audioBase64) {
      // Ses üretilemezse yedek olarak <Say> ile devam et
      const fallbackTwiml = `
        <Response>
          <Say voice="Polly.Filiz" language="tr-TR">
            Şu anda teknik bir sorun yaşıyoruz. Daha sonra tekrar arayacağım.
          </Say>
        </Response>
      `;
      res.type("text/xml");
      return res.send(fallbackTwiml.trim());
    }

    // Alya ses dosyasını çal ve tekrar müşteriden konuşma bekle
    const twimlResponse = `
      <Response>
        <Play>data:audio/mp3;base64,${audioBase64}</Play>
        <Gather input="speech" action="/call" method="POST" speechTimeout="auto" />
      </Response>
    `;

    res.type("text/xml");
    return res.send(twimlResponse.trim());
  } catch (err) {
    console.error("CALL WEBHOOK HATASI:", err);
    const errorTwiml = `
      <Response>
        <Say voice="Polly.Filiz" language="tr-TR">
          Şu anda beklenmeyen bir hata oluştu. Daha sonra tekrar arayacağım.
        </Say>
      </Response>
    `;
    res.type("text/xml");
    return res.send(errorTwiml.trim());
  }
});

// =======================
//  SERVER START
// =======================

app.listen(PORT, () => {
  console.log("🚀 Alya OpenAI Voice Sistemi aktif → PORT", PORT);
});
