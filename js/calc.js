// Reglas de cálculo puras (sin UI ni base de datos). Importes en pesos enteros (COP).
(function (root) {
  const SERVICES = { water: 'Agua', electricity: 'Luz', gas: 'Gas', garbage: 'Basura' };
  const fail = (m) => { throw new Error(m); };

  // Método del mayor resto: la suma siempre es exactamente `amount`; desempate por orden.
  function byWeights(amount, items) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    if (total <= 0) fail('El total de personas es 0. Corrige la ocupación en «Apartamentos».');
    const rows = items.map((it, idx) => {
      const num = amount * it.weight;
      return { id: it.id, idx, base: Math.floor(num / total), rem: num % total };
    });
    let rest = amount - rows.reduce((s, r) => s + r.base, 0);
    [...rows].sort((a, b) => b.rem - a.rem || a.idx - b.idx).forEach((r) => { if (rest > 0) { r.base++; rest--; } });
    return rows.map((r) => ({ id: r.id, amount: r.base }));
  }

  const RULES = { people: 'Por número de personas', equal: 'Partes iguales', direct: 'Asignación directa' };

  // ctx: { code (1|2|3), service, amount, meter, unitId, units:[{id,name,occupants_count,is_active,electricity_meter_group}] }
  function compute(ctx) {
    const { code, service, amount, meter, unitId } = ctx;
    if (!Number.isInteger(amount) || amount <= 0) fail('El importe debe ser un número entero de pesos mayor que cero.');
    if (!SERVICES[service]) fail('Servicio no válido.');
    const units = ctx.units.filter((u) => u.is_active);
    if (!units.length) fail('No hay apartamentos activos en esta casa.');
    let rule, subset, dist;

    if (service === 'electricity' && code === 1) {
      const u = units.find((x) => x.id === unitId) || fail('Selecciona el apartamento al que corresponde la luz.');
      rule = 'direct'; subset = [u]; dist = [{ id: u.id, amount }];
    } else if (service === 'electricity' && code === 3) {
      const grp = ['first_floor', 'shared_apartments'].includes(meter) ? meter : fail('Selecciona el contador de luz.');
      subset = units.filter((u) => u.electricity_meter_group === grp);
      if (!subset.length) fail('No hay apartamentos activos asociados a ese contador. Revisa «Apartamentos».');
      rule = 'people';
      dist = byWeights(amount, subset.map((u) => ({ id: u.id, weight: u.occupants_count })));
    } else {
      rule = 'people'; subset = units; // agua, gas, basura (Casa 3: basura ya viene sumada) y Casas 1-2
      dist = byWeights(amount, subset.map((u) => ({ id: u.id, weight: u.occupants_count })));
    }
    const rows = dist.map((d) => {
      const u = subset.find((x) => x.id === d.id);
      return { apartment_id: u.id, name: u.name, occupants: u.occupants_count, amount: d.amount, rule };
    });
    return { rule, ruleLabel: RULES[rule], rows };
  }

  // Referencias de pago configurables: una por recibo y, donde hay varios contadores, una por contador.
  function refSlots(code, units) {
    const out = [];
    for (const service of Object.keys(SERVICES)) {
      if (code === 1 && service === 'electricity') units.forEach((u) => out.push({ service, key: u.id, label: 'Luz · ' + u.name }));
      else if (code === 3 && service === 'electricity') out.push({ service, key: 'first_floor', label: 'Luz · Contador 1.er piso (2 garajes)' }, { service, key: 'shared_apartments', label: 'Luz · Contador 4 apartamentos' });
      else if (code === 3 && service === 'garbage') out.push({ service, key: 'basura_1', label: 'Basura · Recibo 1' }, { service, key: 'basura_2', label: 'Basura · Recibo 2' });
      else out.push({ service, key: 'shared', label: SERVICES[service] });
    }
    return out;
  }
  function refKeys(code, service, { meter, unitId } = {}) {
    if (code === 1 && service === 'electricity') return [unitId];
    if (code === 3 && service === 'electricity') return [meter];
    if (code === 3 && service === 'garbage') return ['basura_1', 'basura_2'];
    return ['shared'];
  }

  // Días que faltan para la fecha oportuna de pago (fechas 'YYYY-MM-DD', sin problemas de zona horaria)
  function deadlineInfo(dateStr, todayStr) {
    const [y, m, d] = dateStr.split('-').map(Number), [ty, tm, td] = todayStr.split('-').map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
    if (days > 1) return { days, level: 'ok', icon: '⏳', text: `Quedan ${days} días para el pago oportuno` };
    if (days === 1) return { days, level: 'ok', icon: '⏳', text: 'Queda 1 día para el pago oportuno' };
    if (days === 0) return { days, level: 'today', icon: '🔔', text: 'Hoy es la fecha límite' };
    const n = -days;
    return { days, level: 'late', icon: '⚠️', text: `Vencido hace ${n} día${n > 1 ? 's' : ''}` };
  }

  const api = { deadlineInfo, SERVICES, RULES, byWeights, compute, refSlots, refKeys };
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);