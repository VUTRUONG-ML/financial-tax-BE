/**
 * Tax Declaration Wizard — Integration Test Script
 * Chạy: node test-tax-declaration.js
 *
 * Yêu cầu: server đang chạy ở http://localhost:3000
 */

const BASE = 'http://localhost:3000/v1';
const CREDENTIALS = { phoneNumber: '0987654321', password: 'Password123!' };

// ─── Utility ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`);
}

function summarize() {
  const total = passed + failed;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ${passed}/${total} passed`);
  console.log(failed > 0 ? `  ❌ ${failed} test(s) FAILED` : '  🎉 All tests passed!');
  console.log('═'.repeat(60));
}

// ─── Seed period via prisma seed script ───────────────────────────────────────
async function seedOpenPeriod(userId, token) {
  // Tạo period bằng cách patch một period đang CLOSED về OPEN (reopen)
  // hoặc dùng prisma trực tiếp. Ở đây ta dùng API reopen nếu có.
  // Thực tế: dùng prisma migrate thêm seed data
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Tax Declaration Wizard — Integration Tests\n');

  // ── 0. Login ────────────────────────────────────────────────────────────────
  section('0. AUTH');
  const loginRes = await req('POST', '/auth/login', CREDENTIALS);
  check('Login → 200', loginRes.status === 200);
  const token = loginRes.body?.data?.accessToken;
  if (!token) { console.error('🛑 No token. Aborting.'); process.exit(1); }
  console.log(`  ℹ️  Token: ${token.slice(0, 40)}...`);

  // ── Unauthenticated checks (không cần period) ────────────────────────────────
  section('1. Unauthenticated → 401');
  const unauth1 = await req('GET', '/tax-declaration/init', null, null);
  check('GET /init no token → 401', unauth1.status === 401);
  const unauth2 = await req('POST', '/tax-declaration/start', {}, null);
  check('POST /start no token → 401', unauth2.status === 401);

  // ── Init ─────────────────────────────────────────────────────────────────────
  section('2. GET /tax-declaration/init');
  const initRes = await req('GET', '/tax-declaration/init', null, token);
  check('init → 200', initRes.status === 200);
  check('init.isFirstTime is boolean', typeof initRes.body?.data?.isFirstTime === 'boolean');
  check('init.availablePeriods is array', Array.isArray(initRes.body?.data?.availablePeriods));

  const periods = initRes.body?.data?.availablePeriods ?? [];
  if (periods.length === 0) {
    console.log('\n  ⚠️  No OPEN period found for this user.');
    console.log('  ℹ️  Skipping wizard steps. Testing error cases only.\n');
    await testErrorCasesWithoutPeriod(token);
    summarize();
    return;
  }

  const periodId = periods[0].publicId;
  console.log(`  ℹ️  Using period publicId: ${periodId}`);

  // ── Start session ─────────────────────────────────────────────────────────────
  section('3. POST /tax-declaration/start');
  const startGood = await req('POST', '/tax-declaration/start', { periodIdPublicId: periodId }, token);
  check('start valid period → 200', startGood.status === 200, JSON.stringify(startGood.body?.message));

  const start404 = await req('POST', '/tax-declaration/start', { periodIdPublicId: 'invalid-xyz-999' }, token);
  check('[FAIL] start unknown period → 404', start404.status === 404);

  const startBadBody = await req('POST', '/tax-declaration/start', {}, token);
  check('[FAIL] start empty body → 400', startBadBody.status === 400);

  const startForbiddenField = await req('POST', '/tax-declaration/start', { periodIdPublicId: periodId, hackerField: 'x' }, token);
  check('[FAIL] start extra field (whitelist) → 400', startForbiddenField.status === 400);

  // ── Step 1 GET ────────────────────────────────────────────────────────────────
  section('4. GET /tax-declaration/step-1/:id');
  const s1Get = await req('GET', `/tax-declaration/step-1/${periodId}`, null, token);
  check('getStep1 → 200', s1Get.status === 200);
  const s1d = s1Get.body?.data ?? s1Get.body;
  check('step1 has taxCode', 'taxCode' in (s1d ?? {}));

  const s1Bad = await req('GET', '/tax-declaration/step-1/bad-id', null, token);
  check('[FAIL] getStep1 bad id → 404', s1Bad.status === 404);

  // ── Step 1 SAVE ───────────────────────────────────────────────────────────────
  section('5. POST /tax-declaration/step-1/save/:id');
  const s1Save = await req('POST', `/tax-declaration/step-1/save/${periodId}`, {
    taxCode: '0123456789',
    businessName: 'Test Business',
    ownerName: 'Nguyen Van A',
    cccdNumber: '012345678901',
    provinceCity: 'TP.HCM',
  }, token);
  check('saveStep1 valid → 200', s1Save.status === 200);

  const s1SaveExtra = await req('POST', `/tax-declaration/step-1/save/${periodId}`, {
    taxCode: '0123456789',
    unknownField: 'hacked',
  }, token);
  check('[FAIL] saveStep1 extra field → 400', s1SaveExtra.status === 400);

  // ── Step 2 GET ────────────────────────────────────────────────────────────────
  section('6. GET /tax-declaration/step-2/:id');
  const s2Get = await req('GET', `/tax-declaration/step-2/${periodId}`, null, token);
  check('getStep2 → 200', s2Get.status === 200);
  const s2d = s2Get.body?.data ?? s2Get.body;
  check('step2 has confirmedRevenue (number)', typeof s2d?.confirmedRevenue === 'number');

  // ── Step 2 SAVE (no body) ──────────────────────────────────────────────────
  section('7. POST /tax-declaration/step-2/save/:id  (DB snapshot)');
  const s2Save = await req('POST', `/tax-declaration/step-2/save/${periodId}`, null, token);
  check('saveStep2 → 200', s2Save.status === 200, JSON.stringify(s2Save.body?.message ?? s2Save.body));

  // ── Step 3 GET ────────────────────────────────────────────────────────────────
  section('8. GET /tax-declaration/step-3/:id');
  const s3Get = await req('GET', `/tax-declaration/step-3/${periodId}`, null, token);
  check('getStep3 → 200', s3Get.status === 200);
  const items = Array.isArray(s3Get.body?.data) ? s3Get.body.data
    : Array.isArray(s3Get.body) ? s3Get.body : [];
  console.log(`  ℹ️  ${items.length} inventory items`);

  // ── Step 3 SAVE ───────────────────────────────────────────────────────────────
  section('9. POST /tax-declaration/step-3/save/:id');
  if (items.length > 0) {
    const validItems = items.map(i => ({ productPublicId: i.productPublicId, actualClosingQuantity: Math.max(0, i.actualClosingQuantity ?? 0) }));

    const s3Save = await req('POST', `/tax-declaration/step-3/save/${periodId}`, { inventoryItems: validItems }, token);
    check('saveStep3 valid → 200', s3Save.status === 200, JSON.stringify(s3Save.body?.message ?? s3Save.body));

    // negative quantity
    const s3Neg = await req('POST', `/tax-declaration/step-3/save/${periodId}`, {
      inventoryItems: [{ productPublicId: validItems[0].productPublicId, actualClosingQuantity: -1 }]
    }, token);
    check('[FAIL] saveStep3 quantity=-1 → 400', s3Neg.status === 400);

    // float quantity
    const s3Float = await req('POST', `/tax-declaration/step-3/save/${periodId}`, {
      inventoryItems: [{ productPublicId: validItems[0].productPublicId, actualClosingQuantity: 2.5 }]
    }, token);
    check('[FAIL] saveStep3 quantity=2.5 (float) → 400', s3Float.status === 400);

    // fake product
    const s3Fake = await req('POST', `/tax-declaration/step-3/save/${periodId}`, {
      inventoryItems: [{ productPublicId: 'fake-product-xxx', actualClosingQuantity: 5 }]
    }, token);
    check('[FAIL] saveStep3 fake productPublicId → 400 INVALID_PRODUCT_IDS',
      s3Fake.status === 400 && s3Fake.body?.errorCode === 'INVALID_PRODUCT_IDS',
      JSON.stringify(s3Fake.body));

    // empty array
    const s3Empty = await req('POST', `/tax-declaration/step-3/save/${periodId}`, { inventoryItems: [] }, token);
    check('[FAIL] saveStep3 empty array → 400', s3Empty.status === 400);

    // missing productPublicId
    const s3MissingId = await req('POST', `/tax-declaration/step-3/save/${periodId}`, {
      inventoryItems: [{ actualClosingQuantity: 5 }]
    }, token);
    check('[FAIL] saveStep3 missing productPublicId → 400', s3MissingId.status === 400);
  } else {
    console.log('  ⚠️  No inventory items — skipping step 3 validation tests');
    // Still test step 3 error cases
    const s3FakeOnly = await req('POST', `/tax-declaration/step-3/save/${periodId}`, {
      inventoryItems: [{ productPublicId: 'fake-id', actualClosingQuantity: 5 }]
    }, token);
    check('[FAIL] saveStep3 fake product → 400 INVALID_PRODUCT_IDS',
      s3FakeOnly.status === 400 && s3FakeOnly.body?.errorCode === 'INVALID_PRODUCT_IDS',
      JSON.stringify(s3FakeOnly.body));
  }

  // ── Step 4 (try before step 3 confirmed) — guard test ─────────────────────
  section('10. GET & SAVE step-4 before step-3 → guard');
  const s4Get = await req('GET', `/tax-declaration/step-4/${periodId}`, null, token);
  check('getStep4 → 200', s4Get.status === 200);
  const s4d = s4Get.body?.data ?? s4Get.body;
  check('step4 has totalExpense (number)', typeof s4d?.totalExpense === 'number');

  // ── Step 4 SAVE (no body) ──────────────────────────────────────────────────
  section('11. POST /tax-declaration/step-4/save/:id  (DB snapshot)');
  const s4Save = await req('POST', `/tax-declaration/step-4/save/${periodId}`, null, token);
  check('saveStep4 → 200', s4Save.status === 200, JSON.stringify(s4Save.body?.message ?? s4Save.body));

  // ── Step 5 Preview ─────────────────────────────────────────────────────────
  section('12. GET /tax-declaration/step-5/preview/:id');
  const s5Get = await req('GET', `/tax-declaration/step-5/preview/${periodId}`, null, token);
  check('getStep5Preview → 200', s5Get.status === 200);
  const preview = s5Get.body?.data ?? s5Get.body;
  check('preview.step1Data not null', preview?.step1Data != null);
  check('preview.step2Data not null', preview?.step2Data != null);
  check('preview.step4Data not null', preview?.step4Data != null);

  // ── Submit — validation failures ───────────────────────────────────────────
  section('13. POST /submit — Validation Failures');
  const submitEmpty = await req('POST', `/tax-declaration/submit/${periodId}`, {}, token);
  check('[FAIL] submit missing chosenPitMethod → 400', submitEmpty.status === 400);

  const submitBadPit = await req('POST', `/tax-declaration/submit/${periodId}`, { chosenPitMethod: 'INVALID_METHOD' }, token);
  check('[FAIL] submit invalid chosenPitMethod → 400', submitBadPit.status === 400);

  // ── Submit — happy path or DATA_CHANGED ────────────────────────────────────
  section('14. POST /submit — Happy Path');
  const submitRes = await req('POST', `/tax-declaration/submit/${periodId}`, { chosenPitMethod: 'PERCENTAGE' }, token);
  if (submitRes.status === 200) {
    check('submit → 200 success', true);
    check('submit has closedPeriod', submitRes.body?.data?.closedPeriod != null);
    check('submit has declaration', submitRes.body?.data?.declaration != null);

    // Draft should be deleted — try start again → should give 400 PERIOD_NOT_OPEN
    section('15. POST /start on CLOSED period → PERIOD_NOT_OPEN');
    const startClosed = await req('POST', '/tax-declaration/start', { periodIdPublicId: periodId }, token);
    check('start CLOSED period → 400', startClosed.status === 400);
    check('errorCode PERIOD_NOT_OPEN', startClosed.body?.errorCode === 'PERIOD_NOT_OPEN', JSON.stringify(startClosed.body));

  } else if (submitRes.status === 409) {
    check('submit DATA_CHANGED → 409', submitRes.body?.errorCode === 'DATA_CHANGED', JSON.stringify(submitRes.body));
    check('has draftData', submitRes.body?.draftData != null);
    check('has realTimeData', submitRes.body?.realTimeData != null);
    console.log('  ℹ️  Data changed — testing submit-force...');

    const forceRes = await req('POST', `/tax-declaration/submit-force/${periodId}`, { chosenPitMethod: 'PERCENTAGE' }, token);
    check('submit-force → 200', forceRes.status === 200, JSON.stringify(forceRes.body?.message ?? forceRes.body));
  } else {
    check('submit → 200 or 409', false, `Got ${submitRes.status}: ${JSON.stringify(submitRes.body)}`);
  }

  summarize();
}

async function testErrorCasesWithoutPeriod(token) {
  section('Error Cases — no period required');
  const start404 = await req('POST', '/tax-declaration/start', { periodIdPublicId: 'no-such-period' }, token);
  check('[FAIL] start unknown period → 404', start404.status === 404);

  const step1Bad = await req('GET', '/tax-declaration/step-1/no-such-period', null, token);
  check('[FAIL] getStep1 unknown period → 404', step1Bad.status === 404);

  const submitBad = await req('POST', '/tax-declaration/submit/no-such-period', { chosenPitMethod: 'PERCENTAGE' }, token);
  check('[FAIL] submit unknown period → 404', submitBad.status === 404);
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
