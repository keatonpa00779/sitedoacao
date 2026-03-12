const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5500;
const MIUSE_BASE_URL = "https://api.miuse.app";
const MIUSE_API_KEY = process.env.MIUSE_API_KEY || "";

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const requireApiKey = (res) => {
  if (!MIUSE_API_KEY) {
    res.status(500).json({ error: "MIUSE_API_KEY nao configurada no .env" });
    return false;
  }
  return true;
};

const extractErrorMessage = async (response) => {
  try {
    const data = await response.json();
    return data?.error || data?.message || "Erro na API miuse";
  } catch {
    return "Erro na API miuse";
  }
};

app.post("/api/pix", async (req, res) => {
  if (!requireApiKey(res)) return;

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 5 || amount > 999) {
    return res.status(400).json({ error: "Valor invalido. Use entre R$ 5 e R$ 999." });
  }

  try {
    const response = await fetch(`${MIUSE_BASE_URL}/payments/pix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": MIUSE_API_KEY,
      },
      body: JSON.stringify({
        amount: Number(amount.toFixed(2)),
        customer: {
          id: "site-doacao",
          name: "Doacao Site",
        },
      }),
    });

    if (!response.ok) {
      const errorMessage = await extractErrorMessage(response);
      return res.status(response.status).json({ error: errorMessage });
    }

    const data = await response.json();
    const pixCode =
      data?.pix_copia_e_cola ||
      data?.qr_code ||
      data?.pix_code ||
      data?.brcode ||
      data?.data?.pix_copia_e_cola ||
      "";
    const paymentId = data?.payment_id || data?.id || data?.data?.payment_id || "";

    if (!pixCode || !paymentId) {
      return res.status(502).json({ error: "Resposta da miuse incompleta (sem pix ou payment_id)." });
    }

    return res.json({ pixCode, paymentId });
  } catch {
    return res.status(500).json({ error: "Falha ao criar Pix na miuse." });
  }
});

app.get("/api/pix/status/:paymentId", async (req, res) => {
  if (!requireApiKey(res)) return;

  const paymentId = String(req.params.paymentId || "").trim();
  if (!paymentId) {
    return res.status(400).json({ error: "payment_id obrigatorio." });
  }

  try {
    const response = await fetch(`${MIUSE_BASE_URL}/payments/status/${encodeURIComponent(paymentId)}`, {
      headers: {
        "X-API-Key": MIUSE_API_KEY,
      },
    });

    if (!response.ok) {
      const errorMessage = await extractErrorMessage(response);
      return res.status(response.status).json({ error: errorMessage });
    }

    const data = await response.json();
    return res.json({
      status: data?.status || "pending",
      payer: data?.payer || null,
    });
  } catch {
    return res.status(500).json({ error: "Falha ao consultar status na miuse." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "doacao.html"));
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
