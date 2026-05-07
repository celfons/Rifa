import { Hono } from 'hono';

type Bindings = {
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  RIFAS_JSON?: string;
  DB?: D1Database;
};

type Rifa = {
  id: string;
  nome: string;
  preco: number;
  totalNumeros: number;
};

type PurchaseRow = {
  id: number;
  raffle_id: string;
  buyer_name: string;
  buyer_cpf: string;
  buyer_email: string;
  buyer_phone: string;
  numbers_csv: string;
  numbers_count: number;
  ticket_price: number;
  total_amount: number;
  preference_id: string;
  payment_id: string;
  payment_status: string;
  notification_channel: string;
  notification_status: string;
  created_at: string;
  inserted_at: string;
  raw_payload_json: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const defaultRifas: Rifa[] = [
  {
    id: 'rifa-principal',
    nome: 'Rifa Solidária',
    preco: 10,
    totalNumeros: 100
  }
];

app.get('/api/rifas', (c) => {
  const rifas = parseRifas(c.env.RIFAS_JSON);

  return c.json({
    rifas: rifas.map((rifa) => ({
      id: rifa.id,
      name: rifa.nome,
      ticketPrice: rifa.preco,
      totalNumbers: rifa.totalNumeros
    }))
  });
});

app.post('/api/pagamentos/preferencia', async (c) => {
  const accessToken = c.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return c.json({ error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado.' }, 500);
  }

  const body = await c.req.json();
  const numbers = Array.isArray(body.numbers) ? body.numbers : [];
  const raffleId = String(body.raffleId || 'rifa-principal');
  const ticketPrice = Number(body.ticketPrice || 0);

  if (!numbers.length || !ticketPrice) {
    return c.json({ error: 'Payload inválido para criação de preferência.' }, 400);
  }

  const preferencePayload = {
    items: [
      {
        id: raffleId,
        title: `Rifa ${raffleId} - Números ${numbers.join(', ')}`,
        quantity: numbers.length,
        unit_price: ticketPrice,
        currency_id: 'BRL'
      }
    ],
    metadata: {
      raffleId,
      numbers,
      buyer: body.buyer || null
    }
  };

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(preferencePayload)
  });

  if (!response.ok) {
    return c.json({ error: 'Falha ao criar preferência no Mercado Pago.' }, 502);
  }

  const data = await response.json<{ id?: string }>();
  return c.json({ preferenceId: data.id });
});

app.get('/api/pagamentos/status', async (c) => {
  const accessToken = c.env.MERCADO_PAGO_ACCESS_TOKEN;
  const preferenceId = c.req.query('preferenceId');

  if (!accessToken || !preferenceId) {
    return c.json({ error: 'Token do Mercado Pago ou preferenceId ausente.' }, 400);
  }

  const query = new URL('https://api.mercadopago.com/merchant_orders/search');
  query.searchParams.set('preference_id', preferenceId);

  const response = await fetch(query, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return c.json({ error: 'Falha ao consultar status do pagamento.' }, 502);
  }

  const data = await response.json<{ elements?: Array<{ payments?: Array<{ id?: number; status?: string }> }> }>();
  const payment = data.elements?.[0]?.payments?.[0];

  return c.json({
    paymentId: payment?.id || null,
    status: payment?.status || 'pending'
  });
});

app.post('/api/rifas/:id/confirmacao', async (c) => {
  const raffleId = c.req.param('id');
  const payload = await c.req.json();

  const saveResult = await saveInD1(c.env, raffleId, payload);

  if (!saveResult.ok) {
    return c.json({ error: saveResult.error }, 502);
  }

  return c.json({ success: true });
});

app.get('/api/rifas/:id/confirmacoes', async (c) => {
  const raffleId = c.req.param('id');
  const limit = parseConfirmationsLimit(c.req.query('limit'));

  const listResult = await listConfirmationsFromD1(c.env, raffleId, limit);

  if (!listResult.ok) {
    return c.json({ error: listResult.error }, 502);
  }

  return c.json({ purchases: listResult.purchases });
});

app.get('/health', (c) => c.json({ ok: true }));

const DEFAULT_CONFIRMATIONS_LIMIT = 100;
const MAX_CONFIRMATIONS_LIMIT = 500;

async function saveInD1(env: Bindings, raffleId: string, payload: unknown) {
  if (!env.DB) {
    return { ok: false, error: 'Binding do D1 (DB) não configurado.' as const };
  }

  const purchase = normalizePurchasePayload(payload);
  const statement = env.DB.prepare(
    `INSERT INTO rifa_purchases (
      raffle_id,
      buyer_name,
      buyer_cpf,
      buyer_email,
      buyer_phone,
      numbers_csv,
      numbers_count,
      ticket_price,
      total_amount,
      preference_id,
      payment_id,
      payment_status,
      notification_channel,
      notification_status,
      created_at,
      raw_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const result = await statement
    .bind(
      raffleId,
      purchase.buyerName,
      purchase.buyerCpf,
      purchase.buyerEmail,
      purchase.buyerPhone,
      purchase.numbersCsv,
      purchase.numbersCount,
      purchase.ticketPrice,
      purchase.totalAmount,
      purchase.preferenceId,
      purchase.paymentId,
      purchase.paymentStatus,
      purchase.notificationChannel,
      purchase.notificationStatus,
      purchase.createdAt,
      JSON.stringify(payload)
    )
    .run();

  if (!result.success) {
    return { ok: false, error: 'Falha ao salvar confirmação no D1.' as const };
  }

  return { ok: true as const };
}

async function listConfirmationsFromD1(env: Bindings, raffleId: string, limit: number) {
  if (!env.DB) {
    return { ok: false, error: 'Binding do D1 (DB) não configurado.' as const };
  }

  const statement = env.DB.prepare(
    `SELECT
      id,
      raffle_id,
      buyer_name,
      buyer_cpf,
      buyer_email,
      buyer_phone,
      numbers_csv,
      numbers_count,
      ticket_price,
      total_amount,
      preference_id,
      payment_id,
      payment_status,
      notification_channel,
      notification_status,
      created_at,
      inserted_at,
      raw_payload_json
    FROM rifa_purchases
    WHERE raffle_id = ?
    ORDER BY created_at DESC
    LIMIT ?`
  );

  const result = await statement.bind(raffleId, limit).all<PurchaseRow>();

  if (!result.success) {
    return { ok: false, error: 'Falha ao buscar confirmações no D1.' as const };
  }

  const purchases = result.results.map((row) => mapPurchaseRow(row));

  return { ok: true as const, purchases };
}

function mapPurchaseRow(row: PurchaseRow) {
  const numbersCsv = row.numbers_csv || '';
  const numbers = numbersCsv
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    id: row.id,
    raffleId: row.raffle_id || '',
    buyer: {
      name: row.buyer_name || '',
      cpf: row.buyer_cpf || '',
      email: row.buyer_email || '',
      phone: row.buyer_phone || ''
    },
    numbers,
    numbersCount: Number(row.numbers_count || 0),
    ticketPrice: Number(row.ticket_price || 0),
    totalAmount: Number(row.total_amount || 0),
    preferenceId: row.preference_id || '',
    paymentId: row.payment_id || '',
    paymentStatus: row.payment_status || '',
    notification: {
      channel: row.notification_channel || '',
      status: row.notification_status || ''
    },
    createdAt: row.created_at || '',
    insertedAt: row.inserted_at || '',
    rawPayloadJson: row.raw_payload_json || ''
  };
}

function normalizePurchasePayload(payload: unknown) {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const buyer = (data.buyer && typeof data.buyer === 'object' ? data.buyer : {}) as Record<string, unknown>;
  const notification =
    data.notification && typeof data.notification === 'object' ? (data.notification as Record<string, unknown>) : {};
  const numbers = Array.isArray(data.numbers) ? data.numbers.map((value) => String(value)) : [];

  return {
    buyerName: String(buyer.name || ''),
    buyerCpf: String(buyer.cpf || ''),
    buyerEmail: String(buyer.email || ''),
    buyerPhone: String(buyer.phone || ''),
    numbersCsv: numbers.join(','),
    numbersCount: numbers.length,
    ticketPrice: Number(data.ticketPrice || 0),
    totalAmount: Number(data.totalAmount || 0),
    preferenceId: String(data.preferenceId || ''),
    paymentId: String(data.paymentId || ''),
    paymentStatus: String(data.paymentStatus || ''),
    notificationChannel: String(notification.channel || ''),
    notificationStatus: String(notification.status || ''),
    createdAt: String(data.createdAt || new Date().toISOString())
  };
}

function parseConfirmationsLimit(value?: string) {
  if (!value) {
    return DEFAULT_CONFIRMATIONS_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CONFIRMATIONS_LIMIT;
  }

  const limit = Math.min(Math.max(Math.trunc(parsed), 1), MAX_CONFIRMATIONS_LIMIT);
  return limit;
}

function parseRifas(value?: string): Rifa[] {
  if (!value) {
    return defaultRifas;
  }

  try {
    const parsed = JSON.parse(value) as Rifa[];
    if (Array.isArray(parsed) && parsed.length) {
      return parsed;
    }
    return defaultRifas;
  } catch {
    return defaultRifas;
  }
}

export default app;
