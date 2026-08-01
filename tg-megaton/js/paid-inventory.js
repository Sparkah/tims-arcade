const DUPLICATE_SHARDS = Object.freeze({
  common: 6,
  rare: 12,
  epic: 28,
  legendary: 70,
  mythic: 160
});

export function validatePaidGachaReceipt(receipt, productId, skinsById) {
  if (!receipt || !receipt.receiptId || receipt.productId !== productId) return null;
  if (!/^megaton-paid-gacha-v1-/.test(String(receipt.catalogVersion || ''))) return null;
  if (!Array.isArray(receipt.rolls) || Number(receipt.rollCount) !== receipt.rolls.length) return null;

  var rolls = [];
  for (var i = 0; i < receipt.rolls.length; i += 1) {
    var roll = receipt.rolls[i] || {};
    var skin = skinsById[String(roll.itemId || '')];
    var copiesAfter = Math.floor(Number(roll.paidCopiesAfter || 0));
    var boost = roll.boost || {};
    if (!skin || skin.rarity !== roll.rarity || copiesAfter < 1 || copiesAfter > 1000000) return null;
    if (!skin.boost || skin.boost.kind !== boost.kind) return null;
    if (Math.abs(Number(skin.boost.value) - Number(boost.value)) > 0.0000001) return null;
    rolls.push({ skin: skin, paidCopiesAfter: copiesAfter });
  }
  return rolls;
}

export function validatePaidInventorySnapshot(snapshot, skinsById) {
  if (!snapshot || !/^megaton-paid-gacha-v1-/.test(String(snapshot.catalogVersion || ''))) return null;
  if (!Array.isArray(snapshot.items) || snapshot.items.length > 1000) return null;
  var seen = {};
  var items = [];
  for (var i = 0; i < snapshot.items.length; i += 1) {
    var row = snapshot.items[i] || {};
    var itemId = String(row.itemId || '');
    var skin = skinsById[itemId];
    var paidCopies = Number(row.paidCopies);
    if (!skin || seen[itemId] || skin.rarity !== row.rarity) return null;
    if (!Number.isSafeInteger(paidCopies) || paidCopies < 1 || paidCopies > 1000000) return null;
    seen[itemId] = true;
    items.push({ skin: skin, paidCopies: paidCopies });
  }
  return items;
}

function copyCount(state, itemId) {
  return Math.max(0, Math.floor(Number(state.skinCopies && state.skinCopies[itemId] || 0)));
}

function paidCopyCount(state, itemId) {
  return Math.max(0, Math.floor(Number(
    state.gachaStats
      && state.gachaStats.paidSkinCopies
      && state.gachaStats.paidSkinCopies[itemId]
      || 0
  )));
}

export function sellableDuplicateCount(state, itemId) {
  if (!state || !itemId) return 0;
  // Until duplicate sales have their own atomic server RPC, every paid copy is
  // protected. Free copies above that paid floor remain part of the normal
  // local duplicate economy.
  return Math.max(0, copyCount(state, itemId) - Math.max(1, paidCopyCount(state, itemId)));
}

function setCopyCount(state, itemId, count) {
  state.skinCopies = state.skinCopies || {};
  count = Math.max(0, Math.floor(Number(count || 0)));
  if (count) state.skinCopies[itemId] = count;
  else delete state.skinCopies[itemId];
}

export function mergePaidGachaReceipt(state, receipt, verifiedRolls) {
  if (!state || !state.gachaStats || !Array.isArray(verifiedRolls)) return null;
  var receiptIds = state.gachaStats.paidReceiptIds;
  var paidCopies = state.gachaStats.paidSkinCopies;
  var firstLocalApply = !receiptIds[receipt.receiptId];
  var pulled = [];

  verifiedRolls.forEach(function (entry) {
    var skin = entry.skin;
    var previousPaid = Math.max(0, Math.floor(Number(paidCopies[skin.id] || 0)));
    // An already-applied receipt is presentation history, not a grant source.
    // Restoring a cleared watermark from it must never mint another local copy.
    var paidDelta = firstLocalApply ? Math.max(0, entry.paidCopiesAfter - previousPaid) : 0;
    var localCopies = copyCount(state, skin.id);
    var newDuplicates = Math.max(0, paidDelta - (localCopies > 0 ? 0 : 1));

    if (state.ownedSkins.indexOf(skin.id) < 0) state.ownedSkins.push(skin.id);
    // paidSkinCopies is a cumulative server-grant watermark. Merge only a new
    // receipt's delta; replay merely restores the watermark.
    setCopyCount(state, skin.id, Math.max(localCopies + paidDelta, 1));
    if (newDuplicates > 0) {
      state.gachaStats.duplicates += newDuplicates;
      state.gachaStats.shards += newDuplicates * (DUPLICATE_SHARDS[skin.rarity] || 0);
    }
    paidCopies[skin.id] = Math.max(previousPaid, entry.paidCopiesAfter);
    pulled.push(skin);
  });

  if (firstLocalApply) {
    receiptIds[receipt.receiptId] = {
      productId: receipt.productId,
      catalogVersion: receipt.catalogVersion,
      createdAt: receipt.createdAt || new Date().toISOString()
    };
  }

  return {
    firstLocalApply: firstLocalApply,
    pulled: pulled
  };
}

export function mergePaidInventorySnapshot(state, verifiedItems) {
  if (!state || !state.gachaStats || !Array.isArray(verifiedItems)) return null;
  var paidCopies = state.gachaStats.paidSkinCopies;
  if (!paidCopies || typeof paidCopies !== 'object' || Array.isArray(paidCopies)) {
    paidCopies = state.gachaStats.paidSkinCopies = {};
  }
  var addedCopies = 0;
  var restoredItems = [];

  verifiedItems.forEach(function (entry) {
    var skin = entry.skin;
    var previousPaid = Math.max(0, Math.floor(Number(paidCopies[skin.id] || 0)));
    var paidDelta = Math.max(0, entry.paidCopies - previousPaid);
    var localCopies = copyCount(state, skin.id);
    // With a known watermark, add only the server delta. If the watermark was
    // cleared, conservatively restore a floor instead of adding the full paid
    // total to existing local copies; repeated clear/sync cycles then mint
    // neither copies nor shards.
    var nextCopies = previousPaid > 0
      ? localCopies + paidDelta
      : Math.max(localCopies, entry.paidCopies);
    var addedLocalCopies = Math.max(0, nextCopies - localCopies);
    var newDuplicates = Math.max(0, addedLocalCopies - (localCopies > 0 ? 0 : 1));

    if (state.ownedSkins.indexOf(skin.id) < 0) state.ownedSkins.push(skin.id);
    setCopyCount(state, skin.id, Math.max(nextCopies, 1));
    if (newDuplicates > 0) {
      state.gachaStats.duplicates += newDuplicates;
      state.gachaStats.shards += newDuplicates * (DUPLICATE_SHARDS[skin.rarity] || 0);
    }
    paidCopies[skin.id] = Math.max(previousPaid, entry.paidCopies);
    if (addedLocalCopies > 0) {
      addedCopies += addedLocalCopies;
      restoredItems.push(skin);
    }
  });

  return {
    addedCopies: addedCopies,
    restoredItems: restoredItems
  };
}
