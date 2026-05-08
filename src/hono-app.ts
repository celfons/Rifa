import { Hono } from 'hono';

type Bindings = {
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  MERCADO_PAGO_PUBLIC_KEY?: string;
  RIFAS_JSON?: string;
  DB?: D1Database;
  TENANT_ENABLED?: string;
  TENANT_ROOT_DOMAIN?: string;
  TENANT_DEFAULT_ID?: string;
  TENANT_MAP_JSON?: string;
  TENANT_IGNORED_SUBDOMAINS?: string;
  TENANT_ALLOW_HEADER_OVERRIDE?: string;
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

type PurchasedNumbersRow = {
  numbers_csv: string;
};

type Variables = {
  tenantId: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const defaultRifas: Rifa[] = [
  {
    id: 'rifa-principal',
    nome: 'Rifa Solidária',
    preco: 10,
    totalNumeros: 100
  }
];

app.use('/api/*', async (c, next) => {
  const tenantId = resolveTenantId(c);
  c.set('tenantId', tenantId);
  await next();
});

app.get('/api/rifas', (c) => {
  const rifas = parseRifas(c.env.RIFAS_JSON, c.get('tenantId'));

  return c.json({
    rifas: rifas.map((rifa) => ({
      id: rifa.id,
      name: rifa.nome,
      ticketPrice: rifa.preco,
      totalNumbers: rifa.totalNumeros
    }))
  });
});

app.get('/api/config', (c) => {
  const mercadoPagoPublicKey = resolveMercadoPagoPublicKey(c.env.MERCADO_PAGO_PUBLIC_KEY, c.get('tenantId'));

  return c.json({
    mercadoPagoPublicKey: mercadoPagoPublicKey || null
  });
});

app.post('/api/pagamentos/preferencia', async (c) => {
  const accessToken = resolveMercadoPagoAccessToken(c.env.MERCADO_PAGO_ACCESS_TOKEN, c.get('tenantId'));
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

  const returnBaseUrl = resolveReturnBaseUrl(
    c.req.url,
    c.req.header('Origin'),
    c.req.header('Referer')
  );

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
    back_urls: {
      success: returnBaseUrl,
      pending: returnBaseUrl,
      failure: returnBaseUrl
    },
    auto_return: 'approved',
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
    console.error('MercadoPago error:', response);
    return c.json({ error: response }, 502);
  }

  const data = await response.json<{ id?: string }>();
  return c.json({ preferenceId: data.id });
});

app.get('/api/pagamentos/status', async (c) => {
  const accessToken = resolveMercadoPagoAccessToken(c.env.MERCADO_PAGO_ACCESS_TOKEN, c.get('tenantId'));
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

  const saveResult = await saveInD1(c.env, c.get('tenantId'), raffleId, payload);

  if (!saveResult.ok) {
    return c.json({ error: saveResult.error }, 502);
  }

  return c.json({ success: true });
});

app.get('/api/rifas/:id/confirmacoes', async (c) => {
  const raffleId = c.req.param('id');
  const limit = parseConfirmationsLimit(c.req.query('limit'));

  const listResult = await listConfirmationsFromD1(c.env, c.get('tenantId'), raffleId, limit);

  if (!listResult.ok) {
    return c.json({ error: listResult.error }, 502);
  }

  return c.json({ purchases: listResult.purchases });
});

app.get('/api/rifas/:id/numeros-comprados', async (c) => {
  const raffleId = c.req.param('id');

  const listResult = await listPurchasedNumbersFromD1(c.env, c.get('tenantId'), raffleId);

  if (!listResult.ok) {
    return c.json({ error: listResult.error }, 502);
  }

  return c.json({ numbers: listResult.numbers });
});

app.get('/health', (c) => c.json({ ok: true }));

const DEFAULT_CONFIRMATIONS_LIMIT = 100;
const MAX_CONFIRMATIONS_LIMIT = 500;

async function saveInD1(env: Bindings, tenantId: string, raffleId: string, payload: unknown) {
  if (!env.DB) {
    return { ok: false, error: 'Binding do D1 (DB) não configurado.' as const };
  }

  const purchase = normalizePurchasePayload(payload);
  const statement = env.DB.prepare(
    `INSERT INTO rifa_purchases (
      tenant_id,
      raffle_id,
      buyer_name,
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const result = await statement
    .bind(
      tenantId,
      raffleId,
      purchase.buyerName,
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

async function listConfirmationsFromD1(env: Bindings, tenantId: string, raffleId: string, limit: number) {
  if (!env.DB) {
    return { ok: false, error: 'Binding do D1 (DB) não configurado.' as const };
  }

  const statement = env.DB.prepare(
    `SELECT
      id,
      raffle_id,
      buyer_name,
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
    WHERE tenant_id = ?
      AND raffle_id = ?
    ORDER BY created_at DESC
    LIMIT ?`
  );

  const result = await statement.bind(tenantId, raffleId, limit).all<PurchaseRow>();

  if (!result.success) {
    return { ok: false, error: 'Falha ao buscar confirmações no D1.' as const };
  }

  const purchases = result.results.map((row) => mapPurchaseRow(row));

  return { ok: true as const, purchases };
}

async function listPurchasedNumbersFromD1(env: Bindings, tenantId: string, raffleId: string) {
  if (!env.DB) {
    return { ok: false, error: 'Binding do D1 (DB) não configurado.' as const };
  }

  const statement = env.DB.prepare(
    `SELECT
      numbers_csv
    FROM rifa_purchases
    WHERE tenant_id = ?
      AND raffle_id = ?`
  );

  const result = await statement.bind(tenantId, raffleId).all<PurchasedNumbersRow>();

  if (!result.success) {
    return { ok: false, error: 'Falha ao buscar números comprados no D1.' as const };
  }

  const numbersSet = new Set<number>();
  result.results.forEach((row) => {
    parseNumbersCsv(row.numbers_csv || '').forEach((value) => {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        numbersSet.add(parsed);
      }
    });
  });

  const numbers = Array.from(numbersSet).sort((a, b) => a - b);
  return { ok: true as const, numbers };
}

function mapPurchaseRow(row: PurchaseRow) {
  const numbersCsv = row.numbers_csv || '';
  const numbers = parseNumbersCsv(numbersCsv);

  return {
    id: row.id,
    raffleId: row.raffle_id || '',
    buyer: {
      name: row.buyer_name || '',
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

function parseNumbersCsv(value: string) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePurchasePayload(payload: unknown) {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const buyer = (data.buyer && typeof data.buyer === 'object' ? data.buyer : {}) as Record<string, unknown>;
  const notification =
    data.notification && typeof data.notification === 'object' ? (data.notification as Record<string, unknown>) : {};
  const numbers = Array.isArray(data.numbers) ? data.numbers.map((value) => String(value)) : [];

  return {
    buyerName: String(buyer.name || ''),
    buyerPhone: String(buyer.phone || ''),
    numbersCsv: numbers.join(','),
    numbersCount: numbers.length,
    ticketPrice: Number(data.ticketPrice || 0),
    totalAmount: Number(data.totalAmount || 0),
    preferenceId: String(data.preferenceId || ''),
    paymentId: String(data.paymentId || ''),
    paymentStatus: String(data.paymentStatus || ''),
    notificationChannel: String(notification.channel || 'none'),
    notificationStatus: String(notification.status || 'skipped'),
    createdAt: String(data.createdAt || new Date().toISOString())
  };
}

function parseConfirmationsLimit(value?: string) {
  if (!value) {
    return DEFAULT_CONFIRMATIONS_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_CONFIRMATIONS_LIMIT;
  }

  const limit = Math.min(Math.floor(parsed), MAX_CONFIRMATIONS_LIMIT);
  return limit;
}

function resolveReturnBaseUrl(requestUrl: string, originHeader?: string, refererHeader?: string) {
  const candidates = [originHeader, refererHeader].filter(
    (value): value is string => Boolean(value && value !== 'null')
  );

  for (const candidate of candidates) {
    try {
      return new URL(candidate).origin;
    } catch {
      continue;
    }
  }

  return new URL(requestUrl).origin;
}

function parseRifas(value: string | undefined, tenantId: string): Rifa[] {
  if (!value) {
    return defaultRifas;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed) && parsed.length) {
      return parsed as Rifa[];
    }

    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const tenantValue = record[tenantId] ?? record.default ?? record['*'];
      if (Array.isArray(tenantValue) && tenantValue.length) {
        return tenantValue as Rifa[];
      }
    }

    return defaultRifas;
  } catch {
    return defaultRifas;
  }
}

function resolveMercadoPagoAccessToken(value: string | undefined, tenantId: string) {
  return resolveTenantScopedString(value, tenantId);
}

function resolveMercadoPagoPublicKey(value: string | undefined, tenantId: string) {
  return resolveTenantScopedString(value, tenantId);
}

function resolveTenantScopedString(value: string | undefined, tenantId: string) {
  if (!value) {
    return undefined;
  }

  if (!value.trim().startsWith('{')) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return value;
    }

    const record = parsed as Record<string, unknown>;
    const candidate = record[tenantId] ?? record.default ?? record['*'];
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }

    return undefined;
  } catch {
    return value;
  }
}

type TenantRequestLike = {
  env: Bindings;
  req: { url: string; header: (name: string) => string | undefined };
};

function resolveTenantId(c: TenantRequestLike) {
  const env = c.env;
  const defaultTenantId = sanitizeTenantId(env.TENANT_DEFAULT_ID) || 'default';

  const overrideHeader = c.req.header('x-rifa-tenant');
  if (env.TENANT_ALLOW_HEADER_OVERRIDE === '1' && overrideHeader) {
    const overrideTenant = sanitizeTenantId(overrideHeader);
    if (overrideTenant) {
      return overrideTenant;
    }
  }

  const tenantEnabled = env.TENANT_ENABLED === '1' || Boolean(env.TENANT_ROOT_DOMAIN) || Boolean(env.TENANT_MAP_JSON);
  if (!tenantEnabled) {
    return defaultTenantId;
  }

  const hostname = resolveHostname(c.req.url, c.req.header('Host'));
  if (!hostname) {
    return defaultTenantId;
  }

  const ignored = parseCommaList(env.TENANT_IGNORED_SUBDOMAINS);
  const ignoredSubdomains = ignored.length ? ignored : ['www'];

  const rootDomain = (env.TENANT_ROOT_DOMAIN || '').trim().toLowerCase();
  const hostLower = hostname.toLowerCase();

  const tenantSubdomain = resolveTenantSubdomain(hostLower, rootDomain);
  if (!tenantSubdomain || ignoredSubdomains.includes(tenantSubdomain)) {
    return defaultTenantId;
  }

  const tenantMap = parseJsonRecord(env.TENANT_MAP_JSON);
  const mapped = tenantMap?.[tenantSubdomain] ?? tenantSubdomain;
  return sanitizeTenantId(mapped) || defaultTenantId;
}

function resolveHostname(requestUrl: string, hostHeader?: string) {
  try {
    return new URL(requestUrl).hostname;
  } catch {
    if (!hostHeader) {
      return '';
    }
    return hostHeader.split(':')[0] || '';
  }
}

function resolveTenantSubdomain(hostname: string, rootDomain: string) {
  if (!rootDomain) {
    return '';
  }

  if (hostname === rootDomain) {
    return '';
  }

  if (!hostname.endsWith(`.${rootDomain}`)) {
    return '';
  }

  const prefix = hostname.slice(0, -(rootDomain.length + 1));
  if (!prefix) {
    return '';
  }

  return prefix.split('.')[0] || '';
}

function parseCommaList(value?: string) {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseJsonRecord(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, string>;
  } catch {
    return undefined;
  }
}

function sanitizeTenantId(value?: string) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length > 64) {
    return '';
  }

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)) {
    return '';
  }

  return trimmed;
}

export default app;
