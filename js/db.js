// Acceso a datos (Supabase). Ninguna regla de cálculo aquí.
const sb = window.supabase.createClient(window.APP_CONFIG.url, window.APP_CONFIG.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const DB = {
  houses: async () => ok(await sb.from('houses').select('*').order('code')),
  units: async (houseId) => ok(await sb.from('apartments').select('*').eq('house_id', houseId).order('created_at')),
  addUnit: async (u) => ok(await sb.from('apartments').insert(u)),
  saveUnit: async (id, u) => ok(await sb.from('apartments').update({ ...u, updated_at: new Date().toISOString() }).eq('id', id)),
  unitHasHistory: async (id) => { const { count, error } = await sb.from('bill_allocations').select('id', { count: 'exact', head: true }).eq('apartment_id', id); if (error) throw new Error(error.message); return count > 0; },
  duplicate: async (houseId, service, meter, amount, date) => {
    let q = sb.from('utility_bills').select('id').eq('house_id', houseId).eq('service_type', service).eq('amount', amount).eq('bill_date', date);
    q = meter ? q.eq('meter_identifier', meter) : q.is('meter_identifier', null);
    return ok(await q).length > 0;
  },
  refs: async (houseId) => ok(await sb.from('payment_references').select('*').eq('house_id', houseId)),
  saveRefs: async (rows) => ok(await sb.from('payment_references').upsert(rows, { onConflict: 'house_id,service_type,meter_key' })),
  saveBill: async (bill, rows) => {
    const [b] = ok(await sb.from('utility_bills').insert(bill).select());
    const { error } = await sb.from('bill_allocations').insert(rows.map((r) => ({
      bill_id: b.id, apartment_id: r.apartment_id, occupants_count_snapshot: r.occupants,
      apartment_name_snapshot: r.name, allocation_rule: r.rule, allocated_amount: r.amount, paid: r.amount === 0 })));
    if (error) { await sb.from('utility_bills').delete().eq('id', b.id); throw new Error(error.message); } // sin recibos a medias
    return b;
  },
  bills: async (f) => {
    let q = sb.from('utility_bills').select('*, houses(name), bill_allocations(paid)').order('bill_date', { ascending: true }).order('created_at', { ascending: false }).limit(100);
    if (f.house) q = q.eq('house_id', f.house); if (f.service) q = q.eq('service_type', f.service);
    if (f.from) q = q.gte('bill_date', f.from); if (f.to) q = q.lte('bill_date', f.to);
    return ok(await q);
  },
  allocations: async (billId) => ok(await sb.from('bill_allocations').select('*').eq('bill_id', billId).order('apartment_name_snapshot').order('id')),
  setPaid: async (id, paid) => ok(await sb.from('bill_allocations').update({ paid, paid_at: paid ? new Date().toISOString() : null }).eq('id', id)),
  deleteBill: async (id) => ok(await sb.from('utility_bills').delete().eq('id', id)), // borra también sus repartos (cascade)
  deleteAll: async () => ok(await sb.from('utility_bills').delete().gte('created_at', '1970-01-01')),
};