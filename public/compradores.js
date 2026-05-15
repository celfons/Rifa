(() => {
  const config = { ...(window.RIFA_CONFIG || {}) };
  const apiBaseUrl = String(config.API_BASE_URL || '/api').replace(/\/$/, '');
  const buyersLimit = Number(config.BUYERS_PAGE_LIMIT || 100);

  const refs = {
    tenantId: document.getElementById('tenantId'),
    buyersCount: document.getElementById('buyersCount'),
    statusMessage: document.getElementById('statusMessage'),
    tableBody: document.getElementById('buyersTableBody')
  };

  const tableColumnCount =
    refs.tableBody?.closest('table')?.querySelectorAll('thead th')?.length || 1;

  function setStatus(message, type) {
    refs.statusMessage.textContent = message;
    refs.statusMessage.className = `alert alert-${type} mb-3`;
  }

  function clearStatus() {
    refs.statusMessage.textContent = '';
    refs.statusMessage.className = 'alert d-none mb-3';
  }

  function toBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(value) || 0);
  }

  function formatDate(value) {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
  }

  function setBuyersCount(count) {
    refs.buyersCount.textContent = `${count} comprador${count === 1 ? '' : 'es'}`;
  }

  function renderRows(buyers) {
    refs.tableBody.innerHTML = '';

    if (!buyers.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = tableColumnCount;
      cell.className = 'text-center text-secondary py-4';
      cell.textContent = 'Nenhum comprador encontrado para este tenant.';
      row.appendChild(cell);
      refs.tableBody.appendChild(row);
      return;
    }

    buyers.forEach((buyer) => {
      const row = document.createElement('tr');
      const dateCell = document.createElement('td');
      dateCell.textContent = formatDate(buyer.createdAt);

      const nameCell = document.createElement('td');
      nameCell.textContent = buyer.name || '-';

      const phoneCell = document.createElement('td');
      phoneCell.textContent = buyer.phone || '-';

      const raffleCell = document.createElement('td');
      raffleCell.textContent = buyer.raffleId || '-';

      const numbersCountCell = document.createElement('td');
      numbersCountCell.className = 'text-end';
      numbersCountCell.textContent = String(Number(buyer.numbersCount || 0));

      const totalAmountCell = document.createElement('td');
      totalAmountCell.className = 'text-end';
      totalAmountCell.textContent = toBRL(buyer.totalAmount);

      const statusCell = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge text-bg-${buyer.paymentStatus === 'approved' ? 'success' : 'secondary'}`;
      statusBadge.textContent = buyer.paymentStatus || '-';
      statusCell.appendChild(statusBadge);

      row.append(dateCell, nameCell, phoneCell, raffleCell, numbersCountCell, totalAmountCell, statusCell);
      refs.tableBody.appendChild(row);
    });
  }

  async function loadBuyers() {
    setStatus('Carregando compradores...', 'info');
    try {
      const response = await fetch(`${apiBaseUrl}/compradores?limit=${encodeURIComponent(String(buyersLimit))}`);
      if (!response.ok) {
        throw new Error('Não foi possível carregar os compradores do tenant.');
      }

      const data = await response.json();
      const tenantId = String(data.tenantId || 'default');
      const buyers = Array.isArray(data.buyers) ? data.buyers : [];

      refs.tenantId.textContent = tenantId;
      setBuyersCount(buyers.length);
      renderRows(buyers);
      clearStatus();
    } catch (error) {
      refs.tenantId.textContent = '-';
      setBuyersCount(0);
      renderRows([]);
      setStatus(error.message || 'Erro ao carregar compradores.', 'danger');
    }
  }

  void loadBuyers();
})();
