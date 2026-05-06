(() => {
  const config = window.RIFA_CONFIG || {};
  const ticketPrice = Number(config.TICKET_PRICE || 10);
  const totalNumbers = Number(config.TOTAL_NUMBERS || 100);
  const selectedNumbers = new Set();

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

  refs.totalNumbers.textContent = String(totalNumbers);
  refs.ticketPrice.textContent = toBRL(ticketPrice);

  for (let i = 1; i <= totalNumbers; i += 1) {
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

    if (!config.MERCADO_PAGO_PUBLIC_KEY || !config.BACKEND_BASE_URL) {
      setStatus('Configure MERCADO_PAGO_PUBLIC_KEY e BACKEND_BASE_URL no arquivo de configuração.', 'danger');
      return;
    }

    const formData = new FormData(refs.form);
    const payload = {
      buyer: {
        name: String(formData.get('name')).trim(),
        cpf: cleanDigits(String(formData.get('cpf'))),
        email: String(formData.get('email')).trim(),
        phone: String(formData.get('phone')).trim()
      },
      numbers: [...selectedNumbers].sort((a, b) => a - b),
      ticketPrice,
      totalAmount: selectedNumbers.size * ticketPrice
    };

    refs.payButton.disabled = true;

    try {
      const preferenceResponse = await fetch(`${config.BACKEND_BASE_URL}/create-preference`, {
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
        throw new Error('Falha ao inicializar Mercado Pago SDK. Verifique se o script foi carregado e se a chave pública está válida.');
      }
      mercadoPago.checkout({ preference: { id: preferenceId }, autoOpen: true });

      pendingPurchase = { ...payload, preferenceId };
      refs.confirmButton.classList.remove('d-none');
      setStatus('Pagamento iniciado. Após concluir no Mercado Pago, clique em "Já paguei, confirmar pagamento".', 'info');
    } catch (error) {
      setStatus(error.message || 'Falha ao iniciar pagamento.', 'danger');
    } finally {
      refs.payButton.disabled = false;
    }
  });

  refs.confirmButton.addEventListener('click', async () => {
    if (!pendingPurchase) {
      setStatus('Inicie o pagamento primeiro.', 'warning');
      return;
    }

    refs.confirmButton.disabled = true;

    try {
      const statusResponse = await fetch(
        `${config.BACKEND_BASE_URL}/payment-status?preferenceId=${encodeURIComponent(pendingPurchase.preferenceId)}`
      );

      if (!statusResponse.ok) {
        throw new Error('Não foi possível consultar o status do pagamento.');
      }

      const payment = await statusResponse.json();

      if (payment.status !== 'approved') {
        if (payment.status === 'pending' || payment.status === 'in_process') {
          setStatus('Pagamento em processamento. Aguarde alguns instantes e confirme novamente.', 'warning');
        } else {
          setStatus(`Pagamento não aprovado (status: ${payment.status}). Verifique no Mercado Pago e tente outra forma de pagamento.`, 'danger');
        }
        return;
      }

      await savePurchaseToFirebase({
        ...pendingPurchase,
        paymentId: payment.paymentId || null,
        paymentStatus: payment.status,
        createdAt: new Date().toISOString(),
        notification: {
          channel: 'email_sms',
          status: 'pending'
        }
      });

      setStatus('Pagamento aprovado! Compra registrada no Firebase para envio de confirmação por e-mail/SMS.', 'success');
      resetFlow();
    } catch (error) {
      setStatus(error.message || 'Erro ao confirmar pagamento.', 'danger');
    } finally {
      refs.confirmButton.disabled = false;
    }
  });

  function renderSummary() {
    const numbers = [...selectedNumbers].sort((a, b) => a - b);
    refs.selectedNumbers.textContent = numbers.length ? numbers.map((n) => String(n).padStart(2, '0')).join(', ') : 'Nenhum';
    refs.totalAmount.textContent = toBRL(numbers.length * ticketPrice);
  }

  function resetFlow() {
    pendingPurchase = null;
    refs.form.reset();
    selectedNumbers.clear();
    refs.confirmButton.classList.add('d-none');

    refs.grid.querySelectorAll('.number-btn.selected').forEach((button) => {
      button.classList.remove('selected');
    });

    renderSummary();
  }

  async function savePurchaseToFirebase(data) {
    if (!window.firebase || !config.FIREBASE_CONFIG || !config.FIREBASE_CONFIG.projectId) {
      throw new Error('Firebase não configurado. Defina FIREBASE_CONFIG antes de usar.');
    }

    if (!firebase.apps.length) {
      try {
        firebase.initializeApp(config.FIREBASE_CONFIG);
      } catch (firebaseInitError) {
        throw new Error('Falha ao inicializar Firebase. Verifique as configurações no arquivo de configuração.');
      }
    }

    const db = firebase.firestore();
    await db.collection('rifaPurchases').add(data);
  }

  function setStatus(message, type) {
    refs.statusMessage.textContent = message;
    refs.statusMessage.className = `alert alert-${type} mt-3`;
    refs.statusMessage.classList.remove('d-none');
  }

  function cleanDigits(value) {
    return value.replace(/\D/g, '');
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

  renderSummary();
})();
