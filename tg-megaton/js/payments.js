export function createPayments(options) {
  options = options || {};
  var CHECKOUT_PROTOCOL = 'megaton-paid-gacha-v1';
  var GAME_ID = options.gameId;
  var HAS_TG = Boolean(options.hasTelegram);
  var tg = options.telegram;
  var PRODUCTS = options.products;
  var PENDING_TON_KEY = options.pendingTonKey;
  var PENDING_TON_CREDIT_KEY = options.pendingTonCreditKey;
  var PENDING_PAID_GACHA_KEY = options.pendingPaidGachaKey;
  var pendingTonTimer = 0;
  var paidGachaResumeBusy = false;
  var apiPost = options.apiPost;
  var sleep = options.sleep;
  var toast = options.toast;
  var uiText = options.uiText;
  var productTitle = options.productTitle;
  var openTelegramGame = options.openTelegramGame;
  var tonPriceFor = options.tonPriceFor;
  var getTonConnectUI = options.getTonConnectUI;
  var waitForTonWallet = options.waitForTonWallet;
  var applyProduct = options.applyProduct;
  var saveRemoteState = options.saveRemoteState;
  var updateTonCreditFrom = options.updateTonCreditFrom;
  var tonFromNanotons = options.tonFromNanotons;
  var getTonCreditNanotons = options.getTonCreditNanotons;
  var closeShop = options.closeShop;
  var requiresPaidGacha = options.requiresPaidGacha || function () { return false; };
  var requiresServerGrant = options.requiresServerGrant || function () { return false; };
  var applyAuthoritativeState = options.applyAuthoritativeState || function () { return false; };
  var applyPaidInventorySnapshot = options.applyPaidInventorySnapshot || function () { return false; };
  var onAuthoritativeStateApplied = options.onAuthoritativeStateApplied || function () {};
  var analyticsHook = typeof options.analytics === 'function' ? options.analytics : null;
  function track(name, value) {
    if (!analyticsHook) return;
    try { analyticsHook(name, value); } catch (e) {}
  }

  function checkoutProtocolFor(productId) {
    return requiresPaidGacha(productId) ? CHECKOUT_PROTOCOL : '';
  }

  function addCheckoutProtocol(body, productId) {
    var protocol = checkoutProtocolFor(productId);
    if (protocol) body.checkoutProtocol = protocol;
    return body;
  }

  function writePendingTon(pending) {
    try {
      if (pending) localStorage.setItem(PENDING_TON_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_TON_KEY);
    } catch (e) {}
  }

  function readPendingTon() {
    try {
      var raw = localStorage.getItem(PENDING_TON_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function readPendingPaidGacha() {
    try {
      var raw = localStorage.getItem(PENDING_PAID_GACHA_KEY);
      var pending = raw ? JSON.parse(raw) : [];
      return Array.isArray(pending) ? pending.filter(function (row) {
        return row && row.payload && row.productId
          && Date.now() - Number(row.createdAt || 0) <= 48 * 3600000;
      }) : [];
    } catch (e) {
      return [];
    }
  }

  function writePendingTonCredit(pending) {
    try {
      if (pending) localStorage.setItem(PENDING_TON_CREDIT_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_TON_CREDIT_KEY);
    } catch (e) {}
  }

  function readPendingTonCredit() {
    try {
      var raw = localStorage.getItem(PENDING_TON_CREDIT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function newTonCreditRequestId() {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
      }
    } catch (e) {}
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  }

  function writePendingPaidGacha(pending) {
    try {
      if (pending && pending.length) {
        localStorage.setItem(PENDING_PAID_GACHA_KEY, JSON.stringify(pending.slice(-20)));
      } else {
        localStorage.removeItem(PENDING_PAID_GACHA_KEY);
      }
    } catch (e) {}
  }

  function rememberPendingPaidGacha(productId, payload, source, serverGrantApplied) {
    if (!payload || !productId) return;
    var pending = readPendingPaidGacha().filter(function (row) { return row.payload !== payload; });
    pending.push({
      productId: productId,
      payload: payload,
      source: source || 'XTR',
      serverGrantApplied: Boolean(serverGrantApplied),
      createdAt: Date.now()
    });
    writePendingPaidGacha(pending);
  }

  function forgetPendingPaidGacha(payload) {
    writePendingPaidGacha(readPendingPaidGacha().filter(function (row) { return row.payload !== payload; }));
  }

  async function applyVerifiedProduct(productId, payload, source, authoritativeState, serverGrantAlreadyApplied, authoritativeStateRev, existingPaidReceipt) {
    var serverGrantApplied = Boolean(serverGrantAlreadyApplied);
    if (authoritativeState && typeof authoritativeState === 'object') {
      serverGrantApplied = applyAuthoritativeState(authoritativeState, authoritativeStateRev) !== false;
    }
    if (requiresServerGrant(productId) && !serverGrantApplied) {
      rememberPendingPaidGacha(productId, payload, source, false);
      return { applied: false, pending: true, error: 'authoritative_grant_pending' };
    }

    var paidReceipt = existingPaidReceipt || null;
    if (requiresPaidGacha(productId)) {
      if (!paidReceipt) {
        try {
          var redemption = await apiPost('/api/tg-paid-gacha', {
            action: 'redeem',
            game: GAME_ID,
            initData: tg.initData,
            payload: payload,
            checkoutProtocol: CHECKOUT_PROTOCOL
          });
          paidReceipt = redemption && redemption.receipt;
        } catch (e) {
          rememberPendingPaidGacha(productId, payload, source, serverGrantApplied);
          return { applied: false, pending: true, error: e && e.message || 'paid_gacha_pending' };
        }
      }
      if (!paidReceipt || !Array.isArray(paidReceipt.rolls)) {
        rememberPendingPaidGacha(productId, payload, source, serverGrantApplied);
        return { applied: false, pending: true, error: 'paid_gacha_receipt_missing' };
      }
    }

    var applied = applyProduct(productId, {
      payload: payload,
      source: source,
      serverGrantApplied: serverGrantApplied,
      paidGachaReceipt: paidReceipt
    });
    if (requiresPaidGacha(productId) && !applied) {
      rememberPendingPaidGacha(productId, payload, source, serverGrantApplied);
      return { applied: false, pending: true, error: 'paid_gacha_catalog_mismatch' };
    }
    forgetPendingPaidGacha(payload);
    track('pay:applied:' + String(source || 'unknown') + ':' + productId);
    return { applied: true, result: applied, receipt: paidReceipt };
  }

  async function resumePendingPaidGacha() {
    if (!HAS_TG || paidGachaResumeBusy) return [];
    paidGachaResumeBusy = true;
    var applied = [];
    try {
      var pending = readPendingPaidGacha();
      for (var i = 0; i < pending.length; i += 1) {
        var row = pending[i];
        var authoritativeState = null;
        var authoritativeStateRev = null;
        if (requiresServerGrant(row.productId) && !row.serverGrantApplied) {
          try {
            var claim = row.source === 'TON'
              ? await apiPost('/api/tg-ton-verify', {
                game: GAME_ID,
                initData: tg.initData,
                payload: row.payload,
                checkoutProtocol: checkoutProtocolFor(row.productId)
              })
              : await apiPost('/api/tg-purchase', {
                action: 'claim',
                game: GAME_ID,
                initData: tg.initData,
                payload: row.payload,
                checkoutProtocol: checkoutProtocolFor(row.productId)
              });
            authoritativeState = claim && claim.state;
            authoritativeStateRev = claim && claim.stateRev;
          } catch (e) {}
        }
        var result = await applyVerifiedProduct(
          row.productId,
          row.payload,
          row.source,
          authoritativeState,
          row.serverGrantApplied,
          authoritativeStateRev
        );
        if (result.applied) {
          applied.push(result);
          track('pay:resume_ok:' + row.productId);
          saveRemoteState('paid_gacha_resume');
          toast(uiText('toast_purchase_applied', {
            title: productTitle(row.productId, PRODUCTS[row.productId] || {})
          }));
        }
      }
    } finally {
      paidGachaResumeBusy = false;
    }
    return applied;
  }

  async function reconcilePaidGacha() {
    if (!HAS_TG) return [];
    try {
      var data = await apiPost('/api/tg-paid-gacha', {
        action: 'reconcile',
        game: GAME_ID,
        initData: tg.initData,
        checkoutProtocol: CHECKOUT_PROTOCOL
      });
      var receipts = data && Array.isArray(data.receipts) ? data.receipts : [];
      var applied = [];
      var recoveredAuthoritativeState = false;
      for (var i = 0; i < receipts.length; i += 1) {
        var receipt = receipts[i];
        var needsServerGrant = requiresServerGrant(receipt.productId);
        // A reconciliation receipt can outlive the browser tab and its local
        // pending payload. For hybrid products such as Starter, adopt the
        // authoritative grant state before mirroring the server roll. Do not
        // trust a boolean alone: a missing/malformed state fails closed and the
        // regular state + paid-inventory boot sync can recover it later.
        var result = await applyVerifiedProduct(
          receipt.productId,
          '',
          'RECONCILE',
          receipt.state,
          needsServerGrant ? false : receipt.serverGrantApplied,
          receipt.stateRev,
          receipt
        );
        if (result.applied) {
          applied.push(receipt.receiptId);
          if (needsServerGrant) recoveredAuthoritativeState = true;
        }
      }
      if (applied.length) await saveRemoteState('paid_gacha_reconcile');
      if (recoveredAuthoritativeState) onAuthoritativeStateApplied();
      return applied;
    } catch (e) {
      return [];
    }
  }

  async function syncPaidInventory() {
    if (!HAS_TG) return false;
    try {
      var data = await apiPost('/api/tg-paid-gacha', {
        action: 'inventory',
        game: GAME_ID,
        initData: tg.initData,
        checkoutProtocol: CHECKOUT_PROTOCOL
      });
      return applyPaidInventorySnapshot(data && data.snapshot) !== false;
    } catch (e) {
      return false;
    }
  }

  async function verifyTonPayment(order, boc, walletAddress, attempts) {
    if (!order || !order.payload || !HAS_TG) return null;
    var maxAttempts = attempts || 18;
    for (var i = 0; i < maxAttempts; i += 1) {
      try {
        var data = await apiPost('/api/tg-ton-verify', {
          game: GAME_ID,
          initData: tg.initData,
          payload: order.payload,
          boc: boc || order.boc || null,
          walletAddress: walletAddress || order.walletAddress || null,
          checkoutProtocol: checkoutProtocolFor(order.productId)
        });
        if (data && data.paid) return data;
      } catch (e) {
        if (e.status === 503 || e.status === 404) return null;
      }
      await sleep(Math.min(4500, 1200 + i * 260));
    }
    return null;
  }

  async function resumePendingTonPurchase() {
    if (!HAS_TG || pendingTonTimer) return;
    var pending = readPendingTon();
    if (!pending || !pending.payload || !pending.productId) return;
    if (Date.now() - Number(pending.createdAt || 0) > 48 * 3600000) {
      writePendingTon(null);
      return;
    }
    pendingTonTimer = 1;
    try {
      var verified = await verifyTonPayment(pending, pending.boc, pending.walletAddress, 4);
      if (verified && verified.paid) {
        var productId = verified.productId || pending.productId;
        var reward = await applyVerifiedProduct(productId, pending.payload, 'TON', verified.state, false, verified.stateRev);
        if (!reward.applied) return;
        track('ton:resume_ok:' + productId);
        saveRemoteState('ton_purchase_resume');
        writePendingTon(null);
        toast(uiText('toast_ton_applied', { title: productTitle(pending.productId, PRODUCTS[pending.productId] || {}) }));
      }
    } finally {
      pendingTonTimer = 0;
    }
  }

  async function buyTonProduct(id, cb) {
    var product = PRODUCTS[id];
    var price = tonPriceFor(id);
    if (!product || product.disabled || !price) return { ok: false, status: 'bad_product' };
    if (!HAS_TG) {
      openTelegramGame('gamefactory');
      toast(uiText('toast_ton_checkout'));
      if (cb) cb('not_telegram');
      return { ok: false, status: 'not_telegram' };
    }
    try {
      track('ton:start:' + id);
      toast(uiText('toast_ton_connecting'), 2400);
      var ui = await getTonConnectUI();
      var wallet = await waitForTonWallet(ui);
      track('ton:wallet_ok:' + id);
      var order = await apiPost('/api/tg-ton-order', addCheckoutProtocol({
        game: GAME_ID,
        productId: id,
        initData: tg.initData
      }, id));
      track('ton:order_ok:' + id);
      var pending = {
        payload: order.payload,
        productId: id,
        createdAt: Date.now(),
        walletAddress: wallet && wallet.address || null
      };
      writePendingTon(pending);
      toast(uiText('toast_ton_confirm', { ton: order.ton }), 4200);
      var result = await ui.sendTransaction({
        validUntil: order.validUntil,
        network: order.network || '-239',
        messages: [{
          address: order.recipient,
          amount: order.nanotons,
          payload: order.payloadBoc
        }]
      });
      pending.boc = result && result.boc || null;
      writePendingTon(pending);
      track('ton:tx_sent:' + id);
      toast(uiText('toast_ton_waiting'), 3000);
      var verified = await verifyTonPayment(pending, pending.boc, pending.walletAddress, 18);
      track(verified && verified.paid ? 'ton:verify_ok:' + id : 'ton:verify_pending:' + id);
      if (verified && verified.paid) {
        var reward = await applyVerifiedProduct(verified.productId || id, pending.payload, 'TON', verified.state, false, verified.stateRev);
        if (!reward.applied) {
          toast(uiText('toast_receipt_pending'), 4200);
          if (cb) cb('pending_reward');
          return { ok: true, status: 'pending_reward', txHash: verified.txHash || null };
        }
        saveRemoteState('ton_purchase');
        writePendingTon(null);
        toast(uiText('toast_ton_applied', { title: productTitle(id, product) }));
        closeShop();
        if (cb) cb('paid');
        return { ok: true, status: 'paid', txHash: verified.txHash || null };
      }
      toast(uiText('toast_ton_pending'), 4200);
      if (cb) cb('pending');
      return { ok: true, status: 'pending' };
    } catch (e) {
      if (String(e && e.message || '').indexOf('wallet_not_connected') >= 0) {
        track('ton:wallet_missing:' + id);
        toast(uiText('toast_ton_wallet_missing'));
        if (cb) cb('cancelled');
        return { ok: false, status: 'cancelled' };
      }
      if (String(e && e.message || '').indexOf('UserRejects') >= 0 || String(e && e.message || '').indexOf('reject') >= 0) {
        track('ton:tx_rejected:' + id);
        toast(uiText('toast_ton_cancelled'));
        if (cb) cb('cancelled');
        return { ok: false, status: 'cancelled' };
      }
      track('ton:error:' + id);
      toast(uiText('toast_ton_failed', { error: e && e.message || 'unknown_error' }));
      if (cb) cb('error');
      return { ok: false, status: 'error', error: e && e.message || 'unknown_error' };
    }
  }

  async function buyTonCreditProduct(id, cb) {
    var product = PRODUCTS[id];
    if (!product || product.disabled || !tonPriceFor(id)) return { ok: false, status: 'bad_product' };
    if (!HAS_TG) {
      openTelegramGame('gamefactory');
      toast(uiText('toast_ton_checkout'));
      if (cb) cb('not_telegram');
      return { ok: false, status: 'not_telegram' };
    }
    try {
      var pending = readPendingTonCredit();
      if (!pending || pending.productId !== id || Date.now() - Number(pending.createdAt || 0) > 48 * 3600000) {
        pending = {
          requestId: newTonCreditRequestId(),
          productId: id,
          createdAt: Date.now()
        };
        writePendingTonCredit(pending);
      }
      var data = await apiPost('/api/tg-ton-credit', addCheckoutProtocol({
        action: 'spend',
        game: GAME_ID,
        productId: id,
        requestId: pending.requestId,
        initData: tg.initData
      }, id));
      updateTonCreditFrom(data);
      var reward = await applyVerifiedProduct(
        data.productId || id,
        data.payload,
        'TON_CREDIT',
        data.state,
        data.serverGrantApplied,
        data.stateRev,
        data.receipt
      );
      if (!reward.applied) {
        toast(uiText('toast_receipt_pending'), 3200);
        if (cb) cb('pending_reward');
        return { ok: true, status: 'pending_reward', source: 'ton_credit' };
      }
      track('credit:spend_ok:' + id);
      saveRemoteState('ton_credit_spend');
      writePendingTonCredit(null);
      if (reward.result !== 'gacha') {
        toast(uiText('toast_credit_spent', { title: productTitle(id, product), ton: tonFromNanotons(data.creditNanotons) }), 2200);
        closeShop();
      }
      if (cb) cb('paid');
      return { ok: true, status: 'paid', source: 'ton_credit' };
    } catch (e) {
      if (e && e.status === 402) {
        track('credit:insufficient:' + id);
        writePendingTonCredit(null);
        updateTonCreditFrom(e.data);
        toast(uiText('toast_credit_insufficient', {
          ton: tonFromNanotons(e.data && e.data.creditNanotons || getTonCreditNanotons())
        }), 1800);
        if (cb) cb('insufficient_credit');
        return { ok: false, status: 'insufficient_credit' };
      }
      toast(uiText('toast_credit_failed'), 1600);
      if (cb) cb('error');
      return { ok: false, status: 'error', error: e && e.message || 'unknown_error' };
    }
  }

  async function resumePendingTonCreditPurchase() {
    if (!HAS_TG) return null;
    var pending = readPendingTonCredit();
    if (!pending || !pending.requestId || !pending.productId) return null;
    if (Date.now() - Number(pending.createdAt || 0) > 48 * 3600000) {
      writePendingTonCredit(null);
      return null;
    }
    try {
      var data = await apiPost('/api/tg-ton-credit', addCheckoutProtocol({
        action: 'spend',
        game: GAME_ID,
        productId: pending.productId,
        requestId: pending.requestId,
        initData: tg.initData
      }, pending.productId));
      updateTonCreditFrom(data);
      var reward = await applyVerifiedProduct(
        data.productId || pending.productId,
        data.payload,
        'TON_CREDIT',
        data.state,
        data.serverGrantApplied,
        data.stateRev,
        data.receipt
      );
      if (!reward.applied) return reward;
      saveRemoteState('ton_credit_resume');
      writePendingTonCredit(null);
      return reward;
    } catch (e) {
      if (e && e.status === 402) writePendingTonCredit(null);
      return null;
    }
  }

  async function buyProduct(id, currency, cb) {
    if (typeof currency === 'function') {
      cb = currency;
      currency = 'XTR';
    }
    currency = currency || 'XTR';
    var product = PRODUCTS[id];
    if (!product || product.disabled) return { ok: false, status: 'bad_product' };
    track('pay:open:' + currency + ':' + id);
    if (currency === 'TON_CREDIT') return buyTonCreditProduct(id, cb);
    if (currency === 'TON') return buyTonProduct(id, cb);
    if (currency !== 'XTR') {
      toast(uiText('toast_ton_unsupported'));
      if (cb) cb('unsupported_currency');
      return { ok: false, status: 'unsupported_currency' };
    }
    if (!product.stars) {
      toast(uiText('toast_ton_unsupported'));
      if (cb) cb('unsupported_currency');
      return { ok: false, status: 'unsupported_currency' };
    }
    if (!HAS_TG) {
      openTelegramGame('gamefactory');
      toast(uiText('toast_stars_checkout'));
      if (cb) cb('not_telegram');
      return { ok: false, status: 'not_telegram' };
    }
    try {
      toast(uiText('toast_stars_invoice'), 2200);
      var res = await fetch('/api/tg-invoice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          game: 'megaton',
          productId: id,
          initData: tg.initData,
          checkoutProtocol: checkoutProtocolFor(id)
        })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.invoiceLink) throw new Error(data.error || 'invoice_failed');
      return await new Promise(function (resolve) {
        tg.openInvoice(data.invoiceLink, function (status) {
        track('pay:sheet:' + String(status || 'unknown') + ':' + id);
        if (status === 'paid') {
          waitForPurchase(data.payload, id).then(async function (serverPurchase) {
            if (!serverPurchase) {
              track('pay:verify_timeout:' + id);
              if (!product.noAutoApply) rememberPendingPaidGacha(id, data.payload, 'XTR', false);
              toast(uiText('toast_receipt_pending'), 3200);
              if (cb) cb('pending_receipt');
              resolve({ ok: true, status: 'pending_receipt', serverPaid: false });
              return;
            }
            if (!product.noAutoApply) {
              var reward = await applyVerifiedProduct(id, data.payload, 'XTR', serverPurchase.state, false, serverPurchase.stateRev);
              if (!reward.applied) {
                toast(uiText('toast_receipt_pending'), 3200);
                if (cb) cb('pending_reward');
                resolve({ ok: true, status: 'pending_reward', serverPaid: true });
                return;
              }
              if (reward.result !== 'gacha') {
                toast(uiText('toast_purchase_applied', { title: productTitle(id, product) }));
                closeShop();
              }
            } else {
              toast(uiText('toast_product_paid', { title: productTitle(id, product) }));
            }
            saveRemoteState('purchase');
            if (cb) cb('paid');
            resolve({ ok: true, status: 'paid', serverPaid: true });
          });
        } else if (status === 'cancelled') {
          toast(uiText('toast_invoice_cancelled'));
          if (cb) cb('cancelled');
          resolve({ ok: false, status: 'cancelled' });
        } else {
          toast(uiText('toast_invoice_status', { status: status }));
          if (cb) cb(status);
          resolve({ ok: false, status: status });
        }
      });
      });
    } catch (e) {
      track('pay:setup_fail:' + id);
      toast(uiText('toast_payment_setup_failed', { error: e.message }));
      if (cb) cb('error');
      return { ok: false, status: 'error', error: e.message };
    }
  }

  async function waitForPurchase(payload, productId) {
    if (!payload || !HAS_TG) return false;
    for (var i = 0; i < 30; i += 1) {
      try {
        var data = await apiPost('/api/tg-purchase', {
          action: 'claim',
          game: GAME_ID,
          initData: tg.initData,
          payload: payload,
          checkoutProtocol: checkoutProtocolFor(productId)
        });
        if (data && data.paid) return data;
      } catch (e) {
        if (e.status === 503) return false;
      }
      await sleep(1000);
    }
    return false;
  }


  return {
    buyProduct: buyProduct,
    resumePendingTonPurchase: resumePendingTonPurchase,
    resumePendingTonCreditPurchase: resumePendingTonCreditPurchase,
    resumePendingPaidGacha: resumePendingPaidGacha,
    reconcilePaidGacha: reconcilePaidGacha,
    syncPaidInventory: syncPaidInventory
  };
}
