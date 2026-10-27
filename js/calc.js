// Reglas de cálculo puras (sin UI ni base de datos). Importes en pesos enteros (COP).
(function (root) {
  const SERVICES = { water: 'Agua', electricity: 'Luz', gas: 'Gas', garbage: 'Basura' };
  const fail = (m) => { throw new Error(m); };

  // Método del mayor resto: la suma siempre es exactamente `amount`; desempate por orden.
  function byWeights(amount, items) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    if (total <= 0) fail('El total de personas es 0. Corrige la ocupación en «Unidades».');
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
    if (!units.length) fail('No hay unidades activas en esta casa.');
    let rule, subset, dist;

    if (service === 'electricity' && code === 1) {
      const u = units.find((x) => x.id === unitId) || fail('Selecciona el apartamento al que corresponde la luz.');
      rule = 'direct'; subset = [u]; dist = [{ id: u.id, amount }];
    } else if (service === 'electricity' && code === 3) {
      const grp = ['garage_1', 'garage_2', 'shared_apartments'].includes(meter) ? meter : fail('Selecciona el contador de luz.');
      subset = units.filter((u) => u.electricity_meter_group === grp);
      if (!subset.length) fail('No hay unidades activas asociadas a ese contador. Revisa «Unidades».');
      rule = grp === 'shared_apartments' ? 'equal' : 'direct';
      dist = byWeights(amount, subset.map((u) => ({ id: u.id, weight: 1 })));
    } else if (code === 2) {
      rule = 'equal'; subset = units;
      dist = byWeights(amount, subset.map((u) => ({ id: u.id, weight: 1 })));
    } else {
      if (code === 3 && service === 'garbage' && !['basura_1', 'basura_2'].includes(meter)) fail('Selecciona cuál recibo de basura es (1 o 2).');
      rule = 'people'; subset = units;
      dist = byWeights(amount, subset.map((u) => ({ id: u.id, weight: u.occupants_count })));
    }
    const rows = dist.map((d) => {
      const u = subset.find((x) => x.id === d.id);
      return { apartment_id: u.id, name: u.name, occupants: u.occupants_count, amount: d.amount, rule };
    });
    return { rule, ruleLabel: RULES[rule], rows };
  }

  const api = { SERVICES, RULES, byWeights, compute };
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
