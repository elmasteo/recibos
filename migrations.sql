-- Reparto de servicios: esquema, datos iniciales y RLS
create extension if not exists pgcrypto;

create table houses (
  id uuid primary key default gen_random_uuid(),
  code int not null unique,            -- 1, 2, 3 (las reglas dependen de este código)
  name text not null,
  created_at timestamptz not null default now()
);

create table apartments (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id),
  name text not null check (length(trim(name)) > 0),
  occupants_count int not null default 0 check (occupants_count >= 0),
  is_active boolean not null default true,
  electricity_meter_group text not null default 'not_applicable'
    check (electricity_meter_group in ('garage_1','garage_2','shared_apartments','not_applicable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table utility_bills (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id),
  service_type text not null check (service_type in ('water','electricity','gas','garbage')),
  amount numeric(14,2) not null check (amount > 0),
  bill_date date not null,
  invoice_reference text,
  meter_identifier text,
  notes text,
  created_at timestamptz not null default now()
);
create index on utility_bills (house_id, service_type, invoice_reference);

create table bill_allocations (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references utility_bills(id) on delete cascade,
  apartment_id uuid not null references apartments(id),
  occupants_count_snapshot int not null,
  apartment_name_snapshot text not null,
  allocation_rule text not null,
  allocated_amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index on bill_allocations (bill_id);

-- Datos iniciales
insert into houses (code, name) values (1,'Casa 1'),(2,'Casa 2'),(3,'Casa 3');
insert into apartments (house_id, name, occupants_count, electricity_meter_group)
select h.id, v.n, 1, v.g from houses h join (values
  (1,'Apartamento 1','not_applicable'),(1,'Apartamento 2','not_applicable'),
  (2,'Apartamento 1','not_applicable'),(2,'Apartamento 2','not_applicable'),
  (3,'Garaje 1','garage_1'),(3,'Garaje 2','garage_2'),
  (3,'Apartamento 1','shared_apartments'),(3,'Apartamento 2','shared_apartments'),
  (3,'Apartamento 3','shared_apartments'),(3,'Apartamento 4','shared_apartments')
) as v(c,n,g) on v.c = h.code;

-- Seguridad: solo usuarios autenticados (crea los usuarios en Authentication > Users
-- y desactiva "Allow new users to sign up")
alter table houses enable row level security;
alter table apartments enable row level security;
alter table utility_bills enable row level security;
alter table bill_allocations enable row level security;

create policy "auth read houses" on houses for select to authenticated using (true);
create policy "auth all apartments" on apartments for all to authenticated using (true) with check (true);
create policy "auth all bills" on utility_bills for all to authenticated using (true) with check (true);
create policy "auth all allocations" on bill_allocations for all to authenticated using (true) with check (true);
