// Self-check: unique winners + discard redraw. Run: node check.mjs
function removeFromPool(pool, n) {
  const at = pool.indexOf(n);
  if (at >= 0) pool.splice(at, 1);
}

function pickUnique(pool, winners) {
  const taken = new Set(Object.values(winners).filter((v) => v != null));
  const open = pool.filter((n) => !taken.has(n));
  return open[0] ?? null;
}

let pool = [230, 501, 42];
const winners = { ba: null, nhi: null, nhat: null };

const ba = pickUnique(pool, winners);
winners.ba = ba;
removeFromPool(pool, ba);
console.assert(ba === 230, "first pick");
console.assert(!pool.includes(230), "230 removed after reveal");

// discard: clear winner, stay on ba, number stays out
winners.ba = null;
const ba2 = pickUnique(pool, winners);
console.assert(ba2 !== 230 && ba2 != null, "redraw not 230");
winners.ba = ba2;
removeFromPool(pool, ba2);

const nhi = pickUnique(pool, winners);
console.assert(nhi !== winners.ba, "nhi != ba");
winners.nhi = nhi;
removeFromPool(pool, nhi);

const nhat = pickUnique(pool, winners);
console.assert(nhat !== winners.ba && nhat !== winners.nhi, "all unique");
console.log("ok");
