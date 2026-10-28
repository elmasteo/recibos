const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const ICONS = { water: '💧', electricity: '⚡', gas: '🔥', garbage: '🗑️' };
const METERS = { first_floor: 'Contador 1.er piso (2 garajes)', shared_apartments: 'Contador de los 4 apartamentos', basura_total: 'Basura total (2 recibos)', not_applicable: 'Sin contador propio', garage_1: 'Contador Garaje 1', garage_2: 'Contador Garaje 2', basura_1: 'Recibo de basura 1', basura_2: 'Recibo de basura 2' };
const S = { tab: 'calc', service: null, house: null, houses: [], units: [], refs: {}, meter: '', unitId: '', form: {}, result: null, msg: null, saving: false, hist: { f: {}, list: null, open: null, rows: [] } };

const toast = (t) => { const e = $('#toast'); e.textContent = t; e.className = 'show'; setTimeout(() => (e.className = ''), 2600); };
// Ventana emergente propia (reemplaza confirm/prompt). Devuelve Promise<boolean>.
function ask({ title, text, ok = 'Confirmar', danger = false, word = null }) {
  return new Promise((res) => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="mt1"><h3 id="mt1">${esc(title)}</h3><p>${esc(text)}</p>${word ? `<label for="mw">Escribe <b>${esc(word)}</b> para confirmar</label><input id="mw" autocomplete="off">` : ''}<div class="mbtn"><button class="btn ghost" data-r="0">Cancelar</button><button class="btn ${danger ? 'danger' : 'alt'}" data-r="1" ${word ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
    const prev = document.activeElement;
    const key = (e) => { if (e.key === 'Escape') close(false); };
    const close = (v) => { document.removeEventListener('keydown', key); m.remove(); prev?.focus?.(); res(v); };
    m.onclick = (e) => { const r = e.target.dataset?.r; if (r) close(r === '1'); else if (e.target === m) close(false); };
    document.addEventListener('keydown', key);
    document.body.append(m);
    const w = m.querySelector('#mw');
    if (w) w.oninput = () => (m.querySelector('[data-r="1"]').disabled = w.value.trim().toUpperCase() !== word);
    (w || m.querySelector('[data-r="0"]')).focus();
  });
}
const fmtDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
async function loadHouse(id) {
  S.units = await DB.units(id);
  S.refs = Object.fromEntries((await DB.refs(id)).map((r) => [r.service_type + '|' + r.meter_key, r.reference]));
}
const code = () => S.houses.find((h) => h.id === S.house)?.code;
const run = async (fn) => { try { S.msg = null; await fn(); } catch (e) { S.msg = { t: 'err', m: e.message === 'Failed to fetch' ? 'Sin conexión con Supabase. Revisa tu internet e inténtalo de nuevo.' : e.message }; } render(); };

async function init() {
  if (!window.APP_CONFIG.url) { $('#view').innerHTML = '<div class="msg err">Falta configurar Supabase en <code>js/config.js</code>.</div>'; return; }
  $('#view').innerHTML = '<p>Cargando…</p>';
  await run(async () => { S.houses = await DB.houses(); S.house = S.houses[0]?.id; await loadHouse(S.house); });
}
$('#tabs').onclick = (e) => { const t = e.target.closest('button')?.dataset.tab; if (t) { S.tab = t; S.msg = null; if (t === 'calc') Object.assign(S, { service: null, result: null, form: {}, meter: '', unitId: '' }); // «Calcular» siempre abre limpio
      run(async () => { if (t === 'history' && !S.hist.list) await loadHist(); }); } };
const msg = () => (S.msg ? `<div class="msg ${S.msg.t}" role="alert">${esc(S.msg.m)}</div>` : '');
const houseBtns = () => `<div class="grid three">${S.houses.map((h) => `<button class="opt" data-h="${h.id}" aria-pressed="${S.house === h.id}"><span class="ic">🏠</span>${esc(h.name)}</button>`).join('')}</div>`;
async function pickHouse(id) { S.house = id; S.result = null; S.meter = ''; S.unitId = ''; await loadHouse(id); }

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'));
  $('#view').innerHTML = { calc: calcView, units: unitsView, history: histView }[S.tab]();
  bind();
}

function calcView() {
  const c = code(), sv = S.service, f = S.form;
  let h = `<h2>1. ¿Qué recibo?</h2><div class="grid">${Object.entries(Calc.SERVICES).map(([k, v]) => `<button class="opt" data-s="${k}" aria-pressed="${sv === k}"><span class="ic">${ICONS[k]}</span>${v}</button>`).join('')}</div>`;
  h += `<h2>2. ¿Qué casa?</h2>${houseBtns()}`;
  if (!sv) return h + '<p class="msg info">Elige un servicio para continuar.</p>' + msg();
  const act = S.units.filter((u) => u.is_active);
  let extra = '';
  if (sv === 'electricity' && c === 1) extra = `<label for="uid">Apartamento de este recibo</label><select id="uid"><option value="">Elige…</option>${act.map((u) => `<option value="${u.id}" ${S.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>`;
  const gar3 = sv === 'garbage' && c === 3;
  const mo = sv === 'electricity' && c === 3 ? ['first_floor', 'shared_apartments'] : null;
  if (mo) extra = `<label for="mt">¿Cuál contador?</label><select id="mt"><option value="">Elige…</option>${mo.map((m) => `<option value="${m}" ${S.meter === m ? 'selected' : ''}>${METERS[m]}</option>`).join('')}</select>`;
  const how = sv === 'electricity' && c === 1 ? '🎯 Luz individual: se asigna al apartamento elegido, sin dividir.' : sv === 'electricity' && c === 3 ? '👥 Cada contador se reparte por personas entre sus apartamentos (1.er piso: garajes · el otro: 4 apartamentos).' : gar3 ? '🗑️ Se suman los 2 recibos y el total se reparte por personas entre los garajes y los 4 apartamentos.' : '👥 Se reparte según el número de personas de cada apartamento.';
  h += `<h2>3. Datos del recibo</h2><div class="panel"><div class="msg info" style="margin-top:0">${how}</div>${extra}
  ${gar3 ? `<label for="g1">Recibo de basura 1 (COP)</label><input id="g1" inputmode="numeric" placeholder="Ej: 45000" value="${esc(f.g1)}"><label for="g2">Recibo de basura 2 (COP)</label><input id="g2" inputmode="numeric" placeholder="Ej: 38000" value="${esc(f.g2)}">` : `<label for="amt">Importe total (COP)</label><input id="amt" inputmode="numeric" placeholder="Ej: 185000" value="${esc(f.amount)}">`}
  <label for="dt">Fecha Oportuna de pago</label><input id="dt" type="date" value="${esc(f.date || today())}"></div>
  <button class="btn" id="calc" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Guardando…' : 'Calcular y Guardar Recibo'}</button>${msg()}`;
  if (S.result) {
    const r = S.result;
    h += `<section class="result" aria-label="Resultado"><div>${ICONS[sv]} ${Calc.SERVICES[sv]} · ${esc(S.houses.find((x) => x.id === S.house).name)}${r.meter ? ' · ' + esc(METERS[r.meter]) : ''}</div><div class="total">${COP(r.amount)}</div>${r.detail ? `<div>${esc(r.detail)}</div>` : ''}${r.refText ? `<div>Ref. de pago: <b>${esc(r.refText)}</b></div>` : ''}<span class="rule">${esc(r.ruleLabel)}</span>
    ${r.rows.map((x) => `<div class="row"><span>${esc(x.name)}<small>${r.rule === 'people' ? x.occupants + ' persona(s)' : r.rule === 'equal' ? 'Parte igual' : 'Directo'}</small></span><b>${COP(x.amount)}</b></div>`).join('')}</section>
    <div class="msg info">✓ Guardado en Cuentas para seguir los pagos.</div><button class="btn ghost" id="gocuentas">Ver en Cuentas</button>`;
  }
  return h;
}

function refsPanel() {
  const id = (x) => `rf_${x.service}_${x.key}`;
  return `<h2>Referencias de pago</h2><div class="panel"><p class="msg info" style="margin-top:0">Número con el que se paga cada recibo. Se muestra al calcular y queda guardado en la cuenta.</p>${Calc.refSlots(code(), S.units).map((x) => `<label for="${id(x)}">${ICONS[x.service]} ${esc(x.label)}</label><input id="${id(x)}" data-rs="${x.service}" data-rk="${x.key}" value="${esc(S.refs[x.service + '|' + x.key] || '')}" autocomplete="off">`).join('')}<button class="btn" id="saverefs">Guardar referencias</button></div>`;
}
function unitsView() {
  const c = code();
  return `<h2>Casa</h2>${houseBtns()}<h2>Apartamentos</h2>${msg()}` + S.units.map((u) => `<div class="panel unit" data-id="${u.id}">
    <div><label for="n${u.id}">Nombre</label><input id="n${u.id}" class="nm" value="${esc(u.name)}"></div>
    <div><label for="p${u.id}">Personas</label><input id="p${u.id}" class="pp" type="number" min="0" step="1" value="${u.occupants_count}"></div>
    ${c === 3 ? `<div><label for="g${u.id}">Contador de luz</label><select id="g${u.id}" class="gp">${Object.entries({ first_floor: 'Contador 1.er piso (garajes)', shared_apartments: 'Contador de los 4 apartamentos', not_applicable: 'No aplica' }).map(([k, v]) => `<option value="${k}" ${u.electricity_meter_group === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}
    <div class="full"><span class="badge ${u.is_active ? 'on' : 'off'}">${u.is_active ? '✓ Activa' : '⏸ Inactiva'}</span>
      <button class="btn small" data-save="${u.id}">Guardar</button><button class="btn small ghost" data-toggle="${u.id}">${u.is_active ? 'Desactivar' : 'Activar'}</button></div></div>`).join('')
    + `<button class="btn alt" id="add">+ Agregar apartamento</button>` + refsPanel();
}

async function loadHist() { S.hist.list = await DB.bills(S.hist.f); }
function histView() {
  const f = S.hist.f, H = S.hist;
  let h = `<h2>Cuentas</h2><div class="filters"><select id="fh" aria-label="Casa"><option value="">Todas las casas</option>${S.houses.map((x) => `<option value="${x.id}" ${f.house === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
  <select id="fs" aria-label="Servicio"><option value="">Todos los servicios</option>${Object.entries(Calc.SERVICES).map(([k, v]) => `<option value="${k}" ${f.service === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
  <input type="date" id="ff" aria-label="Desde" value="${f.from || ''}"><input type="date" id="ft" aria-label="Hasta" value="${f.to || ''}"></div>${msg()}`;
  if (!H.list?.length) return h + '<p class="msg info">No hay cuentas pendientes con estos filtros.</p>';
  h += `<button class="btn small danger" id="delall" style="margin-top:14px">🗑️ Borrar todas las cuentas</button>`;
  return h + H.list.map((b) => {
    const al = b.bill_allocations || [], p = al.filter((a) => a.paid).length;
    const st = al.length && p === al.length ? '<span class="badge paidb">✓ Todos pagaron</span>' : `<span class="badge off">${p}/${al.length} pagaron</span>`;
    const det = H.open !== b.id ? '' : `<div class="panel light"><p><b>Regla:</b> ${esc(Calc.RULES[H.rows[0]?.allocation_rule] || '')}</p>${b.notes ? `<p>📝 ${esc(b.notes)}</p>` : ''}
      ${H.rows.map((r) => `<div class="row ${r.paid ? 'paid' : ''}"><label class="chk"><input type="checkbox" data-paid="${r.id}" ${r.paid ? 'checked' : ''}><span>${esc(r.apartment_name_snapshot)}<small>${r.occupants_count_snapshot} persona(s) al calcular${r.paid && r.paid_at ? ' · Pagó el ' + new Date(r.paid_at).toLocaleDateString('es-CO') : ''}</small></span></label>
      <span class="amt"><b>${COP(r.allocated_amount)}</b><span class="badge ${r.paid ? 'paidb' : 'off'}">${r.paid ? '✓ Pagado' : 'Pendiente'}</span></span></div>`).join('')}
      <button class="btn small danger" data-del="${b.id}" style="margin-top:12px">🗑️ Eliminar este recibo</button></div>`;
    const dl = Calc.deadlineInfo(b.bill_date, today()), mt = METERS[b.meter_identifier];
    return `<button class="hist" data-b="${b.id}" aria-expanded="${H.open === b.id}">
      <span class="h-top"><span>${ICONS[b.service_type]} ${Calc.SERVICES[b.service_type]} · ${esc(b.houses.name)}</span><b>${COP(b.amount)}</b></span>
      <span class="h-meta"><span>📅 ${fmtDate(b.bill_date)}</span>${b.invoice_reference ? `<span>🔖 Ref. ${esc(b.invoice_reference)}</span>` : ''}${mt ? `<span>${esc(mt)}</span>` : ''}</span>
      <span class="dl ${dl.level}">${dl.icon} ${dl.text}</span>
      <span>${st}</span></button>${det}`;
  }).join('');
}

function bind() {
  const on = (sel, ev, fn) => document.querySelectorAll(sel).forEach((e) => (e['on' + ev] = fn));
  on('[data-s]', 'click', (e) => { S.service = e.currentTarget.dataset.s; S.result = null; S.meter = ''; S.unitId = ''; render(); });
  on('[data-h]', 'click', (e) => run(() => pickHouse(e.currentTarget.dataset.h)));
  on('#mt', 'change', (e) => (S.meter = e.target.value)); on('#uid', 'change', (e) => (S.unitId = e.target.value));
  on('#calc', 'click', () => run(async () => {
    const num = (v) => Number(String(v ?? '').replace(/[.,\s$]/g, ''));
    const gar3 = S.service === 'garbage' && code() === 3;
    S.form = { amount: $('#amt')?.value, g1: $('#g1')?.value, g2: $('#g2')?.value, date: $('#dt').value };
    if (!S.form.date) throw new Error('Indica la fecha del recibo.');
    let amount, detail = null;
    if (gar3) {
      const a = num(S.form.g1), b = num(S.form.g2);
      if (!S.form.g1 || !S.form.g2 || !(a >= 0) || !(b >= 0)) throw new Error('Ingresa el valor de los 2 recibos de basura.');
      amount = a + b; detail = `Recibo 1: ${COP(a)} + Recibo 2: ${COP(b)}`;
    } else amount = num(S.form.amount);
    const meter = gar3 ? 'basura_total' : S.meter;
    const r = Calc.compute({ code: code(), service: S.service, amount, meter, unitId: S.unitId, units: S.units });
    const keys = Calc.refKeys(code(), S.service, { meter: S.meter, unitId: S.unitId });
    const refText = keys.map((k, i) => { const v = S.refs[`${S.service}|${k}`]; return v ? (keys.length > 1 ? `R${i + 1}: ${v}` : v) : null; }).filter(Boolean).join(' · ');
    const bmeter = meter || (S.service === 'electricity' && code() === 1 ? S.unitId : null);
    if (await DB.duplicate(S.house, S.service, bmeter, amount, S.form.date) && !(await ask({ title: '¿Recibo repetido?', text: 'Ya hay una cuenta con la misma casa, servicio, fecha e importe. ¿Guardar de todos modos?', ok: 'Sí, guardar' }))) return;
    S.result = null; S.saving = true; render();
    try { await DB.saveBill({ house_id: S.house, service_type: S.service, amount, bill_date: S.form.date, invoice_reference: refText || null, meter_identifier: bmeter, notes: detail }, r.rows); }
    finally { S.saving = false; }
    S.result = { ...r, amount, meter: meter || null, detail, refText }; S.form = { date: S.form.date }; S.hist.list = null; toast('✓ Recibo guardado en Cuentas');
  }));
  on('#gocuentas', 'click', () => { S.tab = 'history'; run(loadHist); });
  // Apartamentos
  const val = (id) => { const p = document.querySelector(`[data-id="${id}"]`); return { name: p.querySelector('.nm').value.trim(), occ: p.querySelector('.pp').value, grp: p.querySelector('.gp')?.value }; };
  on('[data-save]', 'click', (e) => run(async () => {
    const id = e.currentTarget.dataset.save, v = val(id), n = Number(v.occ);
    if (!v.name) throw new Error('El nombre no puede estar vacío.');
    if (!Number.isInteger(n) || n < 0) throw new Error('Las personas deben ser un entero igual o mayor que 0.');
    await DB.saveUnit(id, { name: v.name, occupants_count: n, ...(v.grp ? { electricity_meter_group: v.grp } : {}) });
    S.units = await DB.units(S.house); toast('✓ Cambios guardados');
  }));
  on('[data-toggle]', 'click', (e) => run(async () => {
    const id = e.currentTarget.dataset.toggle, u = S.units.find((x) => x.id === id);
    if (u.is_active && (await DB.unitHasHistory(id)) && !(await ask({ title: 'Desactivar apartamento', text: 'Este apartamento tiene cuentas registradas. Se conservarán, pero ya no entrará en nuevos cálculos.', ok: 'Sí, desactivar' }))) return;
    await DB.saveUnit(id, { is_active: !u.is_active }); S.units = await DB.units(S.house);
  }));
  on('#add', 'click', () => run(async () => { await DB.addUnit({ house_id: S.house, name: `Apartamento ${S.units.length + 1}`, occupants_count: 1 }); S.units = await DB.units(S.house); toast('✓ Apartamento agregado: edita su nombre'); }));
  on('#saverefs', 'click', () => run(async () => {
    const rows = [...document.querySelectorAll('[data-rs]')].map((i) => ({ house_id: S.house, service_type: i.dataset.rs, meter_key: i.dataset.rk, reference: i.value.trim(), updated_at: new Date().toISOString() }));
    await DB.saveRefs(rows); rows.forEach((r) => (S.refs[r.service_type + '|' + r.meter_key] = r.reference)); toast('✓ Referencias guardadas');
  }));
  // Cuentas
  on('[data-paid]', 'change', async (e) => {
    const cb = e.target, id = cb.dataset.paid, want = cb.checked; cb.checked = !want;
    const r = S.hist.rows.find((x) => x.id === id), b = S.hist.list.find((x) => x.id === S.hist.open);
    const who = `${r.apartment_name_snapshot} (${b.houses.name})`;
    const last = want && S.hist.rows.every((x) => x.id === id || x.paid);
    const yes = await ask(want
      ? { title: 'Confirmar pago', text: `¿Está seguro que el ${who} ya pagó?${last ? ' Es el último pago pendiente: la cuenta quedará completa y se eliminará de Cuentas.' : ''}`, ok: 'Sí, ya pagó' }
      : { title: 'Quitar pago', text: `¿Quitar la marca de pago de ${who}?`, ok: 'Quitar pago' });
    if (!yes) return;
    run(async () => {
      await DB.setPaid(id, want);
      if (last) { await DB.deleteBill(b.id); S.hist.open = null; toast('✓ Cuenta completa: eliminada de Cuentas'); }
      else { S.hist.rows = await DB.allocations(b.id); toast(want ? '✓ Pago registrado' : 'Pago desmarcado'); }
      await loadHist();
    });
  });
  on('[data-del]', 'click', async (e) => {
    const id = e.currentTarget.dataset.del;
    if (!(await ask({ title: 'Eliminar cuenta', text: 'Se eliminará este recibo y su reparto. No se puede deshacer. Úsalo si se agregó por error o con un valor incorrecto.', ok: 'Sí, eliminar', danger: true }))) return;
    run(async () => { await DB.deleteBill(id); S.hist.open = null; await loadHist(); toast('✓ Recibo eliminado'); });
  });
  on('#delall', 'click', async () => {
    if (!(await ask({ title: 'Borrar todas las cuentas', text: 'Se eliminarán TODOS los recibos y repartos de todas las casas. No se puede deshacer. Los apartamentos y las referencias no se borran.', ok: 'Borrar todo', danger: true, word: 'BORRAR' }))) return;
    run(async () => { await DB.deleteAll(); S.hist.open = null; await loadHist(); toast('✓ Cuentas eliminadas'); });
  });
  const filt = () => run(async () => { S.hist.f = { house: $('#fh').value, service: $('#fs').value, from: $('#ff').value, to: $('#ft').value }; S.hist.open = null; await loadHist(); });
  ['#fh', '#fs', '#ff', '#ft'].forEach((s) => on(s, 'change', filt));
  on('[data-b]', 'click', (e) => run(async () => { const id = e.currentTarget.dataset.b; if (S.hist.open === id) { S.hist.open = null; return; } S.hist.rows = await DB.allocations(id); S.hist.open = id; }));
}
init();