import { Hono } from 'hono';

type Bindings = {
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_API_KEY?: string;
  RIFAS_JSON?: string;
};

type Rifa = {
  id: string;
  nome: string;
  preco: number;
  totalNumeros: number;
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

  const firebaseResult = await saveInFirebase(c.env, raffleId, payload);

  if (!firebaseResult.ok) {
    return c.json({ error: firebaseResult.error }, 502);
  }

  return c.json({ success: true });
});

app.get('/health', (c) => c.json({ ok: true }));

async function saveInFirebase(env: Bindings, raffleId: string, payload: unknown) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) {
    return { ok: false, error: 'FIREBASE_PROJECT_ID/FIREBASE_API_KEY não configurados.' as const };
  }

  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/rifaPurchases`
  );
  url.searchParams.set('key', env.FIREBASE_API_KEY);

  const body = {
    fields: {
      raffleId: { stringValue: raffleId },
      payloadJson: { stringValue: JSON.stringify(payload) },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    return { ok: false, error: 'Falha ao salvar confirmação no Firestore.' as const };
  }

  return { ok: true as const };
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
