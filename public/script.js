async function callCustomer() {
    const number = document.getElementById("phone").value.trim();
    const result = document.getElementById("result");

    if (!number) {
        result.innerHTML = "❌ Numara girilmedi.";
        return;
    }

    try {
        const res = await fetch("/call-customer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number })
        });

        const data = await res.json();

        if (data.ok) {
            result.innerHTML = "✔ Arama başlatıldı. Call SID: " + data.callSID;
        } else {
            result.innerHTML = "❌ Hata: " + data.error;
        }

    } catch (err) {
        result.innerHTML = "❌ Hata: Sunucuya ulaşılamadı.";
    }
}
