-- Seed: airports, flights, and past booking history for the dev user
-- User ID: d515189a-4643-4ed8-951d-7baf07e281b4

-- ── Airports ──────────────────────────────────────────────────────────────────
INSERT INTO airports (iata_code, name, city, country, timezone) VALUES
  ('ARN', 'Stockholm Arlanda Airport',    'Stockholm',  'Sweden',      'Europe/Stockholm'),
  ('LHR', 'London Heathrow Airport',      'London',     'UK',          'Europe/London'),
  ('OSL', 'Oslo Gardermoen Airport',      'Oslo',       'Norway',      'Europe/Oslo'),
  ('CPH', 'Copenhagen Airport',           'Copenhagen', 'Denmark',     'Europe/Copenhagen'),
  ('HEL', 'Helsinki-Vantaa Airport',      'Helsinki',   'Finland',     'Europe/Helsinki'),
  ('AMS', 'Amsterdam Schiphol Airport',   'Amsterdam',  'Netherlands', 'Europe/Amsterdam'),
  ('GOT', 'Gothenburg Landvetter Airport','Gothenburg',  'Sweden',      'Europe/Stockholm'),
  ('BCN', 'Barcelona El Prat Airport',    'Barcelona',  'Spain',       'Europe/Madrid'),
  ('DUB', 'Dublin Airport',               'Dublin',     'Ireland',     'Europe/Dublin'),
  ('CDG', 'Paris Charles de Gaulle',      'Paris',      'France',      'Europe/Paris')
ON CONFLICT (iata_code) DO NOTHING;

-- ── Past flights (DEPARTED) ───────────────────────────────────────────────────
INSERT INTO flights (
  id, flight_number, origin_iata, destination_iata,
  departure_at, arrival_at,
  economy_seats_total, economy_seats_available,
  business_seats_total, business_seats_available,
  economy_fare_pence, business_fare_pence,
  status
) VALUES
  (
    'f1000001-0000-0000-0000-000000000001',
    'MA101', 'ARN', 'LHR',
    NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days' + INTERVAL '2h30m',
    180, 140, 20, 18, 8900, 24900, 'DEPARTED'
  ),
  (
    'f1000001-0000-0000-0000-000000000002',
    'MA210', 'OSL', 'CPH',
    NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days' + INTERVAL '1h10m',
    180, 150, 20, 19, 4900, 14900, 'DEPARTED'
  ),
  (
    'f1000001-0000-0000-0000-000000000003',
    'MA315', 'CPH', 'OSL',
    NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days' + INTERVAL '1h10m',
    180, 160, 20, 19, 4900, 14900, 'DEPARTED'
  ),
  (
    'f1000001-0000-0000-0000-000000000004',
    'MA422', 'HEL', 'AMS',
    NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days' + INTERVAL '3h00m',
    180, 130, 20, 17, 10900, 29900, 'DEPARTED'
  ),
  (
    'f1000001-0000-0000-0000-000000000005',
    'MA533', 'GOT', 'BCN',
    NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' + INTERVAL '3h45m',
    180, 120, 20, 16, 11900, 32900, 'DEPARTED'
  ),
  -- Upcoming scheduled flight
  (
    'f1000001-0000-0000-0000-000000000006',
    'MA640', 'ARN', 'DUB',
    NOW() + INTERVAL '21 days', NOW() + INTERVAL '21 days' + INTERVAL '2h50m',
    180, 90, 20, 12, 9900, 27900, 'SCHEDULED'
  )
ON CONFLICT (id) DO NOTHING;

-- ── Bookings ──────────────────────────────────────────────────────────────────
INSERT INTO bookings (id, reference, user_id, status, total_price_pence, created_at, updated_at) VALUES
  -- ARN→LHR (solo economy, 90 days ago)
  ('b1000001-0000-0000-0000-000000000001', 'MKHIST', 'd515189a-4643-4ed8-951d-7baf07e281b4',
   'CONFIRMED', 8900, NOW() - INTERVAL '92 days', NOW() - INTERVAL '92 days'),
  -- OSL→CPH→OSL return (2 segments, economy, 60 days ago)
  ('b1000001-0000-0000-0000-000000000002', 'MK0SLR', 'd515189a-4643-4ed8-951d-7baf07e281b4',
   'CONFIRMED', 9800, NOW() - INTERVAL '62 days', NOW() - INTERVAL '62 days'),
  -- HEL→AMS (business, 30 days ago)
  ('b1000001-0000-0000-0000-000000000003', 'MKBIZZ', 'd515189a-4643-4ed8-951d-7baf07e281b4',
   'CONFIRMED', 29900, NOW() - INTERVAL '32 days', NOW() - INTERVAL '32 days'),
  -- GOT→BCN (cancelled, 14 days ago)
  ('b1000001-0000-0000-0000-000000000004', 'MKCANX', 'd515189a-4643-4ed8-951d-7baf07e281b4',
   'CANCELLED', 11900, NOW() - INTERVAL '16 days', NOW() - INTERVAL '14 days'),
  -- ARN→DUB (upcoming, CONFIRMED)
  ('b1000001-0000-0000-0000-000000000005', 'MKNEXT', 'd515189a-4643-4ed8-951d-7baf07e281b4',
   'CONFIRMED', 9900, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- ── Booking Segments ──────────────────────────────────────────────────────────
INSERT INTO booking_segments (id, booking_id, flight_id, seat_class, fare_paid_pence) VALUES
  ('a1000001-0000-0000-0000-000000000001', 'b1000001-0000-0000-0000-000000000001', 'f1000001-0000-0000-0000-000000000001', 'ECONOMY', 8900),
  ('a1000001-0000-0000-0000-000000000002', 'b1000001-0000-0000-0000-000000000002', 'f1000001-0000-0000-0000-000000000002', 'ECONOMY', 4900),
  ('a1000001-0000-0000-0000-000000000003', 'b1000001-0000-0000-0000-000000000002', 'f1000001-0000-0000-0000-000000000003', 'ECONOMY', 4900),
  ('a1000001-0000-0000-0000-000000000004', 'b1000001-0000-0000-0000-000000000003', 'f1000001-0000-0000-0000-000000000004', 'BUSINESS', 29900),
  ('a1000001-0000-0000-0000-000000000005', 'b1000001-0000-0000-0000-000000000004', 'f1000001-0000-0000-0000-000000000005', 'ECONOMY', 11900),
  ('a1000001-0000-0000-0000-000000000006', 'b1000001-0000-0000-0000-000000000005', 'f1000001-0000-0000-0000-000000000006', 'ECONOMY', 9900)
ON CONFLICT (id) DO NOTHING;

-- ── Booking Passengers ────────────────────────────────────────────────────────
INSERT INTO booking_passengers (id, booking_id, full_name, date_of_birth, document_type, document_number) VALUES
  ('c1000001-0000-0000-0000-000000000001', 'b1000001-0000-0000-0000-000000000001', 'Festus-Olaleye Ayomikun', '1995-03-12', 'PASSPORT', 'P12345678'),
  ('c1000001-0000-0000-0000-000000000002', 'b1000001-0000-0000-0000-000000000002', 'Festus-Olaleye Ayomikun', '1995-03-12', 'PASSPORT', 'P12345678'),
  ('c1000001-0000-0000-0000-000000000003', 'b1000001-0000-0000-0000-000000000003', 'Festus-Olaleye Ayomikun', '1995-03-12', 'PASSPORT', 'P12345678'),
  ('c1000001-0000-0000-0000-000000000004', 'b1000001-0000-0000-0000-000000000004', 'Festus-Olaleye Ayomikun', '1995-03-12', 'PASSPORT', 'P12345678'),
  ('c1000001-0000-0000-0000-000000000005', 'b1000001-0000-0000-0000-000000000005', 'Festus-Olaleye Ayomikun', '1995-03-12', 'PASSPORT', 'P12345678')
ON CONFLICT (id) DO NOTHING;
