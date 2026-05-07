(() => {
  const config = window.RIFA_CONFIG || {};
  const apiBaseUrl = String(config.API_BASE_URL || '/api').replace(/\/$/, '');
  const notificationChannel = String(config.NOTIFICATION_CHANNEL || 'email_sms');
  const fallbackTicketPrice = Number(config.TICKET_PRICE || 10);
  const fallbackTotalNumbers = Number(config.TOTAL_NUMBERS || 100);
  const selectedNumbers = new Set();
  const pendingPurchaseStorageKey = 'rifa_pending_purchase';

  let raffle = {
    id: String(config.RAFFLE_ID || 'rifa'),
    name: 'Rifa principal',
    ticketPrice: fallbackTicketPrice,
    totalNumbers: fallbackTotalNumbers
  };

  const refs = {
    grid: document.getElementById('numbersGrid'),
    totalNumbers: document.getElementById('totalNumbers'),
    ticketPrice: document.getElementById('ticketPrice'),
    selectedNumbers: document.getElementById('selectedNumbers'),
    totalAmount: document.getElementById('totalAmount'),
    form: document.getElementById('buyerForm'),
    cpf: document.getElementById('cpf'),
    payButton: document.getElementById('payButton'),
    confirmButton: document.getElementById('confirmButton'),
    statusMessage: document.getElementById('statusMessage')
  };

  let pendingPurchase = null;

  refs.cpf.addEventListener('input', (event) => {
    event.target.value = maskCPF(event.target.value);
  });

  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!refs.form.reportValidity()) {
      return;
    }

    if (selectedNumbers.size === 0) {
      setStatus('Selecione pelo menos um número para continuar.', 'warning');
      return;
    }

    if (!config.MERCADO_PAGO_PUBLIC_KEY) {
      setStatus('Configure MERCADO_PAGO_PUBLIC_KEY no arquivo de configuração.', 'danger');
      return;
    }

    const formData = new FormData(refs.form);
    const cpfDigits = cleanDigits(String(formData.get('cpf')));

    if (!isValidCPF(cpfDigits)) {
      setStatus('CPF inválido. Verifique o número informado.', 'warning');
      return;
    }

    const payload = {
      raffleId: raffle.id,
      buyer: {
        name: String(formData.get('name')).trim(),
        cpf: cpfDigits,
        email: String(formData.get('email')).trim(),
        phone: String(formData.get('phone')).trim()
      },
      numbers: [...selectedNumbers].sort((a, b) => a - b),
      ticketPrice: raffle.ticketPrice,
      totalAmount: selectedNumbers.size * raffle.ticketPrice
    };

    refs.payButton.disabled = true;

    try {
      const preferenceResponse = await fetch(`${apiBaseUrl}/pagamentos/preferencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!preferenceResponse.ok) {
        throw new Error('Não foi possível criar a preferência de pagamento.');
      }

      const { preferenceId } = await preferenceResponse.json();

      if (!preferenceId) {
        throw new Error('Resposta inválida do backend (preferenceId ausente).');
      }

      let mercadoPago;
      try {
        mercadoPago = new MercadoPago(config.MERCADO_PAGO_PUBLIC_KEY, { locale: 'pt-BR' });
      } catch (sdkError) {
        throw new Error('Falha ao inicializar Mercado Pago SDK. Verifique se o script foi carregado corretamente.');
      }
      mercadoPago.checkout({ preference: { id: preferenceId }, autoOpen: true });

      pendingPurchase = { ...payload, preferenceId };
      savePendingPurchase(pendingPurchase);
      refs.confirmButton.classList.remove('d-none');
      setStatus('Pagamento iniciado. Após concluir no Mercado Pago, clique em "Já paguei, confirmar pagamento".', 'info');
    } catch (error) {
      setStatus(error.message || 'Falha ao iniciar pagamento.', 'danger');
    } finally {
      refs.payButton.disabled = false;
    }
  });

  refs.confirmButton.addEventListener('click', () => {
    void confirmPendingPurchase();
  });

  async function confirmPendingPurchase({ auto = false } = {}) {
    if (!pendingPurchase) {
      setStatus('Inicie o pagamento primeiro.', 'warning');
      return;
    }

    if (!pendingPurchase.preferenceId) {
      setStatus('Preferência de pagamento ausente. Inicie o pagamento novamente.', 'danger');
      return;
    }

    refs.confirmButton.disabled = true;

    try {
      const statusResponse = await fetch(
        `${apiBaseUrl}/pagamentos/status?preferenceId=${encodeURIComponent(pendingPurchase.preferenceId)}`
      );

      if (!statusResponse.ok) {
        throw new Error('Não foi possível consultar o status do pagamento.');
      }

      const payment = await statusResponse.json();

      if (payment.status !== 'approved') {
        if (payment.status === 'pending' || payment.status === 'in_process') {
          setStatus('Pagamento em processamento. Aguarde alguns instantes e confirme novamente.', 'warning');
        } else {
          setStatus(
            `Pagamento não aprovado (status: ${payment.status}). Verifique no Mercado Pago e tente outra forma de pagamento.`,
            'danger'
          );
        }
        return;
      }

      await sendConfirmationToApi({
        ...pendingPurchase,
        paymentId: payment.paymentId || null,
        paymentStatus: payment.status,
        createdAt: new Date().toISOString(),
        notification: {
          channel: notificationChannel,
          status: 'pending'
        }
      });

      setStatus('Pagamento aprovado! Compra registrada para disparo de confirmação por e-mail/SMS.', 'success');
      resetFlow();
    } catch (error) {
      setStatus(error.message || 'Erro ao confirmar pagamento.', 'danger');
    } finally {
      refs.confirmButton.disabled = false;
    }
  }

  function savePendingPurchase(purchase) {
    try {
      localStorage.setItem(pendingPurchaseStorageKey, JSON.stringify(purchase));
    } catch (error) {
      console.warn('Não foi possível salvar o pagamento pendente no navegador.', error);
    }
  }

  function readPendingPurchaseFromStorage() {
    try {
      const raw = localStorage.getItem(pendingPurchaseStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn('Não foi possível ler o pagamento pendente no navegador.', error);
      return null;
    }
  }

  function restorePendingPurchaseFromStorage({ showMessage = true } = {}) {
    const stored = readPendingPurchaseFromStorage();
    if (!stored) {
      return null;
    }

    pendingPurchase = stored;
    refs.confirmButton.classList.remove('d-none');

    if (showMessage) {
      setStatus('Encontramos um pagamento pendente. Confirme para concluir a compra.', 'info');
    }

    return stored;
  }

  function clearPendingPurchaseFromStorage() {
    try {
      localStorage.removeItem(pendingPurchaseStorageKey);
    } catch (error) {
      console.warn('Não foi possível limpar o pagamento pendente no navegador.', error);
    }
  }

  function getPaymentReturnInfo() {
    const params = new URLSearchParams(window.location.search);
    const preferenceId = params.get('preference_id') || params.get('preferenceId');
    const paymentId = params.get('payment_id') || params.get('collection_id');
    const status = params.get('status') || params.get('collection_status');
    const hasReturn = Boolean(preferenceId || paymentId || status);

    return {
      hasReturn,
      preferenceId,
      paymentId,
      status
    };
  }

  function clearReturnParams() {
    if (!window.location.search) {
      return;
    }

    const newUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, document.title, newUrl);
  }

  async function handlePaymentReturn(returnInfo) {
    if (!returnInfo.hasReturn) {
      return;
    }

    clearReturnParams();

    if (!pendingPurchase) {
      setStatus(
        'Pagamento concluído no Mercado Pago, mas não foi possível recuperar os dados da compra. Inicie novamente ou entre em contato.',
        'warning'
      );
      return;
    }

    if (returnInfo.preferenceId) {
      if (!pendingPurchase.preferenceId) {
        pendingPurchase = { ...pendingPurchase, preferenceId: returnInfo.preferenceId };
        savePendingPurchase(pendingPurchase);
      } else if (pendingPurchase.preferenceId !== returnInfo.preferenceId) {
        refs.confirmButton.classList.remove('d-none');
        setStatus(
          'Retorno do Mercado Pago não corresponde à compra salva. Confirme manualmente ou inicie uma nova compra.',
          'warning'
        );
        return;
      }
    }

    refs.confirmButton.classList.remove('d-none');
    setStatus('Pagamento retornou do Mercado Pago. Confirmando automaticamente...', 'info');
    await confirmPendingPurchase({ auto: true });
  }

  async function loadRaffle() {
    try {
      const response = await fetch(`${apiBaseUrl}/rifas`);
      if (!response.ok) {
        throw new Error('Falha ao carregar rifas.');
      }

      const { rifas } = await response.json();
      if (Array.isArray(rifas) && rifas.length > 0) {
        raffle = rifas.find((item) => item.id === raffle.id) || rifas[0];
      }
    } catch (error) {
      setStatus('Usando configuração local de rifa, API de rifas indisponível no momento.', 'warning');
    }

    refs.totalNumbers = "1000";
    refs.ticketPrice = toBRL(10);
    renderNumbersGrid();
    renderSummary();
  }

  function renderNumbersGrid() {
    refs.grid.innerHTML = '';
    selectedNumbers.clear();

    for (let i = 1; i <= raffle.totalNumbers; i += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'number-btn';
      button.textContent = String(i).padStart(2, '0');
      button.addEventListener('click', () => {
        if (selectedNumbers.has(i)) {
          selectedNumbers.delete(i);
          button.classList.remove('selected');
        } else {
          selectedNumbers.add(i);
          button.classList.add('selected');
        }
        renderSummary();
      });
      refs.grid.appendChild(button);
    }
  }

  function renderSummary() {
    const numbers = [...selectedNumbers].sort((a, b) => a - b);
    refs.selectedNumbers.textContent = numbers.length ? numbers.map((n) => String(n).padStart(2, '0')).join(', ') : 'Nenhum';
    refs.totalAmount.textContent = toBRL(numbers.length * raffle.ticketPrice);
  }

  function resetFlow() {
    pendingPurchase = null;
    clearPendingPurchaseFromStorage();
    refs.form.reset();
    selectedNumbers.clear();
    refs.confirmButton.classList.add('d-none');

    refs.grid.querySelectorAll('.number-btn.selected').forEach((button) => {
      button.classList.remove('selected');
    });

    renderSummary();
  }

  async function sendConfirmationToApi(data) {
    const response = await fetch(`${apiBaseUrl}/rifas/${encodeURIComponent(raffle.id)}/confirmacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Não foi possível registrar a confirmação da compra na API da rifa.');
    }
  }

  function setStatus(message, type) {
    refs.statusMessage.textContent = message;
    refs.statusMessage.className = `alert alert-${type} mt-3`;
    refs.statusMessage.classList.remove('d-none');
  }

  function cleanDigits(value) {
    return value.replace(/\D/g, '');
  }

  function isValidCPF(cpf) {
    if (!cpf || cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
      return false;
    }

    const calcDigit = (base, factor) => {
      let total = 0;
      for (let i = 0; i < base.length; i += 1) {
        total += Number(base[i]) * (factor - i);
      }
      const remainder = (total * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };

    const firstDigit = calcDigit(cpf.slice(0, 9), 10);
    const secondDigit = calcDigit(cpf.slice(0, 10), 11);
    return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
  }

  function maskCPF(value) {
    const digits = cleanDigits(value).slice(0, 11);
    let masked = digits;

    if (digits.length > 3) {
      masked = `${digits.slice(0, 3)}.${digits.slice(3)}`;
    }
    if (digits.length > 6) {
      masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    }
    if (digits.length > 9) {
      masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }

    return masked;
  }

  function toBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value));
  }

  async function init() {
    await loadRaffle();
    const returnInfo = getPaymentReturnInfo();
    restorePendingPurchaseFromStorage({ showMessage: !returnInfo.hasReturn });
    await handlePaymentReturn(returnInfo);
  }

  void init();
})();
