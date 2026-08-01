import { getProduct } from './tgProducts.js';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function rawPayerId(purchase) {
  const raw = purchase && purchase.raw;
  const rawFrom = raw && typeof raw === 'object' && raw.from && typeof raw.from === 'object'
    ? raw.from
    : null;
  const directFrom = purchase && purchase.from && typeof purchase.from === 'object'
    ? purchase.from
    : null;
  const from = rawFrom || directFrom;
  return from && from.id !== undefined && from.id !== null
    ? String(from.id)
    : '';
}

function exactStarsAmount(value, expected) {
  const amount = Number(value);
  const catalogAmount = Number(expected);
  return Number.isSafeInteger(amount)
    && Number.isSafeInteger(catalogAmount)
    && amount > 0
    && amount === catalogAmount;
}

function exactTonAmount(value, expected) {
  try {
    if (value === undefined || value === null || value === '') return false;
    const amount = BigInt(String(value));
    const catalogAmount = BigInt(String(expected));
    return amount > 0n && amount === catalogAmount;
  } catch {
    return false;
  }
}

// Validate the complete paid-receipt envelope before any deterministic or
// random server grant. Disabled catalog entries remain valid here so an
// already-paid historical receipt can still be inspected/fulfilled; invoice
// creation independently rejects disabled products.
export function validateVerifiedPurchase(purchase, expected = {}) {
  if (!purchase || typeof purchase !== 'object' || Array.isArray(purchase)) {
    return { ok: false, error: 'purchase_missing' };
  }

  const game = String(purchase.game || '');
  const productId = String(purchase.product_id || purchase.productId || '');
  const telegramUserId = String(
    purchase.telegram_user_id || purchase.telegramUserId || '',
  );
  const payload = String(purchase.payload || '');

  if (expected.game !== undefined && game !== String(expected.game)) {
    return { ok: false, error: 'purchase_game_mismatch' };
  }
  if (expected.productId !== undefined && productId !== String(expected.productId)) {
    return { ok: false, error: 'purchase_product_mismatch' };
  }
  if (
    expected.telegramUserId !== undefined
    && telegramUserId !== String(expected.telegramUserId)
  ) {
    return { ok: false, error: 'purchase_owner_mismatch' };
  }
  if (expected.payload !== undefined && payload !== String(expected.payload)) {
    return { ok: false, error: 'purchase_payload_mismatch' };
  }
  if (!game || !productId || !telegramUserId || !payload) {
    return { ok: false, error: 'purchase_identity_missing' };
  }
  if (purchase.status !== 'paid') {
    return { ok: false, error: 'purchase_not_paid' };
  }
  if (!nonEmpty(String(purchase.paid_at || purchase.paidAt || ''))) {
    return { ok: false, error: 'purchase_paid_at_missing' };
  }
  const paidAt = Date.parse(String(purchase.paid_at || purchase.paidAt));
  if (!Number.isFinite(paidAt)) {
    return { ok: false, error: 'purchase_paid_at_invalid' };
  }

  const payerId = rawPayerId(purchase);
  if (payerId && payerId !== telegramUserId) {
    return { ok: false, error: 'purchase_payer_mismatch' };
  }

  const product = getProduct(game, productId);
  if (!product) return { ok: false, error: 'purchase_product_unknown' };

  const currency = String(purchase.currency || '').toUpperCase();
  if (currency === 'XTR') {
    if (!exactStarsAmount(purchase.total_amount ?? purchase.totalAmount, product.amount)) {
      return { ok: false, error: 'purchase_amount_mismatch' };
    }
    if (!nonEmpty(String(
      purchase.telegram_payment_charge_id
      || purchase.telegramPaymentChargeId
      || '',
    ))) {
      return { ok: false, error: 'purchase_charge_missing' };
    }
  } else if (currency === 'TON' || currency === 'TON_CREDIT') {
    if (!exactTonAmount(purchase.total_amount ?? purchase.totalAmount, product.nanotons)) {
      return { ok: false, error: 'purchase_amount_mismatch' };
    }
    if (!nonEmpty(String(
      purchase.provider_payment_charge_id
      || purchase.providerPaymentChargeId
      || '',
    ))) {
      return { ok: false, error: 'purchase_charge_missing' };
    }
  } else {
    return { ok: false, error: 'purchase_currency_mismatch' };
  }

  return {
    ok: true,
    error: '',
    currency,
    product,
    totalAmount: purchase.total_amount ?? purchase.totalAmount,
  };
}
