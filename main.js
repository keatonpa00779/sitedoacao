const donateButton = document.getElementById("donateButton");
const customAmount = document.getElementById("customAmount");
const amountButtons = document.querySelectorAll(".amount-btn");
const pixModal = document.getElementById("pixModal");
const closeModal = document.getElementById("closeModal");
const pixCode = document.getElementById("pixCode");
const pixQr = document.getElementById("pixQr");
const copyPix = document.getElementById("copyPix");
const checkPixStatusButton = document.getElementById("checkPixStatus");
const paymentIdText = document.getElementById("paymentIdText");
const pixStatus = document.getElementById("pixStatus");
const donationToast = document.getElementById("donationToast");
const toastText = document.getElementById("toastText");

let currentPaymentId = "";
let pixStatusPollingInterval = null;

const formatCurrency = (value) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const updateDonateButton = (amount) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    donateButton.textContent = "💚 Fazer Doação";
    return;
  }
  donateButton.textContent = `💚 Fazer Doação - ${formatCurrency(amount)}`;
};

const openModal = () => {
  pixModal.classList.add("open");
  pixModal.setAttribute("aria-hidden", "false");
};

const closeModalHandler = () => {
  pixModal.classList.remove("open");
  pixModal.setAttribute("aria-hidden", "true");
  clearStatusPolling();
};

const getSelectedAmount = () => {
  const selected = document.querySelector(".amount-btn.active");
  if (selected) {
    return Number(selected.dataset.amount);
  }
  return Number(customAmount.value);
};

const setPixLoading = (loading) => {
  donateButton.disabled = loading;
  donateButton.textContent = loading ? "Gerando Pix..." : donateButton.textContent;
  pixStatus.textContent = loading ? "Gerando Pix, aguarde..." : "";
};

const buildQrUrl = (pix) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pix)}`;

const extractPixCode = (payload) => {
  if (!payload || typeof payload !== "object") return "";

  const candidates = [
    payload.pix_copia_e_cola,
    payload.qr_code,
    payload.pix_code,
    payload.brcode,
    payload.copy_paste,
    payload?.payment?.pix_copia_e_cola,
    payload?.payment?.qr_code,
    payload?.payment?.pix_code,
    payload?.payment?.brcode,
    payload?.data?.pix_copia_e_cola,
    payload?.data?.qr_code,
    payload?.data?.pix_code,
    payload?.data?.brcode,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
};

const requestPix = async (amount) => {
  if (window.location.protocol === "file:") {
    throw new Error("Abra o site pelo servidor local (npm start). Nao use file://.");
  }

  const response = await fetch("/api/pix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Number(amount.toFixed(2)), // Valor em reais (5 a 999)
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Erro ao gerar Pix");
  }

  const pixCode = data?.pixCode || extractPixCode(data);
  if (!pixCode) {
    throw new Error("A API respondeu sem codigo Pix. Verifique o endpoint e os campos retornados.");
  }

  const paymentId = data?.paymentId || data?.payment_id || data?.id || data?.data?.payment_id || "";
  if (!paymentId) {
    throw new Error("A API respondeu sem payment_id. Nao e possivel consultar o status.");
  }

  return { pixCode, paymentId };
};

const requestPixStatus = async (paymentId) => {
  const response = await fetch(`/api/pix/status/${encodeURIComponent(paymentId)}`, {
    method: "GET",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Erro ao consultar status do Pix");
  }

  return data;
};

const clearStatusPolling = () => {
  if (pixStatusPollingInterval) {
    clearInterval(pixStatusPollingInterval);
    pixStatusPollingInterval = null;
  }
};

const renderPaidStatus = (statusData) => {
  const payerName = statusData?.payer?.name ? ` por ${statusData.payer.name}` : "";
  pixStatus.textContent = `Pagamento confirmado${payerName}.`;
};

const checkCurrentPixStatus = async () => {
  if (!currentPaymentId) {
    pixStatus.textContent = "Gere um Pix primeiro para consultar o status.";
    return;
  }

  const statusData = await requestPixStatus(currentPaymentId);
  const status = String(statusData?.status || "").toLowerCase();

  if (status === "paid") {
    renderPaidStatus(statusData);
    clearStatusPolling();
    return;
  }

  pixStatus.textContent = "Pix aguardando pagamento.";
};

const startStatusPolling = () => {
  clearStatusPolling();
  pixStatusPollingInterval = setInterval(async () => {
    try {
      await checkCurrentPixStatus();
    } catch {
      // Ignora erros intermitentes durante polling para nao travar a UX.
    }
  }, 10000);
};

amountButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    amountButtons.forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    customAmount.value = "";
    updateDonateButton(Number(btn.dataset.amount));
  });
});

customAmount.addEventListener("input", (event) => {
  amountButtons.forEach((item) => item.classList.remove("active"));
  const amount = Number(event.target.value);
  updateDonateButton(amount);
});

donateButton.addEventListener("click", async () => {
  const amount = getSelectedAmount();
  if (!Number.isFinite(amount) || amount < 5 || amount > 999) {
    pixStatus.textContent = "Informe um valor entre R$ 5 e R$ 999.";
    openModal();
    return;
  }

  try {
    setPixLoading(true);
    openModal();
    pixCode.value = "";
    pixQr.removeAttribute("src");
    paymentIdText.textContent = "";
    clearStatusPolling();
    const { pixCode: pix, paymentId } = await requestPix(amount);
    currentPaymentId = paymentId;
    pixCode.value = pix;
    pixQr.src = buildQrUrl(pix);
    paymentIdText.textContent = `payment_id: ${paymentId}`;
    pixStatus.textContent = "Pix pronto. Use o QR ou copie o codigo.";
    await checkCurrentPixStatus();
    startStatusPolling();
  } catch (error) {
    pixStatus.textContent = error.message || "Nao foi possivel gerar o Pix.";
  } finally {
    setPixLoading(false);
    updateDonateButton(amount);
  }
});

copyPix.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pixCode.value);
    pixStatus.textContent = "Codigo copiado com sucesso!";
  } catch (error) {
    pixStatus.textContent = "Nao foi possivel copiar. Selecione e copie manualmente.";
  }
});

closeModal.addEventListener("click", closeModalHandler);
pixModal.addEventListener("click", (event) => {
  if (event.target?.dataset?.close === "true") {
    closeModalHandler();
  }
});

checkPixStatusButton.addEventListener("click", async () => {
  try {
    pixStatus.textContent = "Consultando status do Pix...";
    await checkCurrentPixStatus();
  } catch (error) {
    pixStatus.textContent = error.message || "Falha ao consultar status.";
  }
});

updateDonateButton(50);

const toastSamples = [
  { name: "Ana", amount: 30 },
  { name: "Carlos", amount: 50 },
  { name: "Bianca", amount: 80 },
  { name: "Joao", amount: 25 },
  { name: "Livia", amount: 60 },
  { name: "Marcos", amount: 100 },
  { name: "Paula", amount: 45 },
  { name: "Renato", amount: 70 },
];

let toastTimeout;

const showDonationToast = () => {
  if (!donationToast || !toastText) return;
  const sample = toastSamples[Math.floor(Math.random() * toastSamples.length)];
  toastText.textContent = `${sample.name} doou ${formatCurrency(sample.amount)}.`;
  donationToast.classList.add("show");
  donationToast.setAttribute("aria-hidden", "false");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    donationToast.classList.remove("show");
    donationToast.setAttribute("aria-hidden", "true");
  }, 6000);
};

setTimeout(showDonationToast, 15000);
setInterval(showDonationToast, 10 * 60 * 1000);
