/**
 * Development seed — airports and scheduled flights for MikunAir.
 *
 * 10 airports across Europe; hub-and-spoke network modelled on SAS routes.
 * Generates 31 days of flights from today, with 2-3 departures per route/day.
 * ON CONFLICT DO NOTHING — safe to re-run.
 */

import { sql } from 'drizzle-orm';
import { getDb, airports, flights } from './index.js';

// ─── Airport master data ───────────────────────────────────────────────────────

const AIRPORTS = [
  { iataCode: 'ARN', name: 'Stockholm Arlanda Airport',   city: 'Stockholm',  country: 'Sweden',          timezone: 'Europe/Stockholm'  },
  { iataCode: 'CPH', name: 'Copenhagen Airport Kastrup',  city: 'Copenhagen', country: 'Denmark',         timezone: 'Europe/Copenhagen' },
  { iataCode: 'OSL', name: 'Oslo Gardermoen Airport',     city: 'Oslo',       country: 'Norway',          timezone: 'Europe/Oslo'       },
  { iataCode: 'HEL', name: 'Helsinki Vantaa Airport',     city: 'Helsinki',   country: 'Finland',         timezone: 'Europe/Helsinki'   },
  { iataCode: 'GOT', name: 'Gothenburg Landvetter Airport', city: 'Gothenburg', country: 'Sweden',         timezone: 'Europe/Stockholm'  },
  { iataCode: 'LHR', name: 'London Heathrow Airport',     city: 'London',     country: 'United Kingdom',  timezone: 'Europe/London'     },
  { iataCode: 'MAN', name: 'Manchester Airport',          city: 'Manchester', country: 'United Kingdom',  timezone: 'Europe/London'     },
  { iataCode: 'AMS', name: 'Amsterdam Schiphol Airport',  city: 'Amsterdam',  country: 'Netherlands',     timezone: 'Europe/Amsterdam'  },
  { iataCode: 'CDG', name: 'Paris Charles de Gaulle Airport', city: 'Paris',  country: 'France',          timezone: 'Europe/Paris'      },
  { iataCode: 'DUB', name: 'Dublin Airport',              city: 'Dublin',     country: 'Ireland',         timezone: 'Europe/Dublin'     },
] as const;

// ─── Route definitions ─────────────────────────────────────────────────────────

interface RouteTemplate {
  origin: string;
  destination: string;
  durationMinutes: number;
  departures: { hour: number; minute: number }[];
  economyFarePence: number;
  businessFarePence: number;
}

const ROUTES: RouteTemplate[] = [
  // ── Scandinavia ↔ London ──────────────────────────────────────────────────
  { origin: 'ARN', destination: 'LHR', durationMinutes: 150, departures: [{ hour: 6, minute: 30 }, { hour: 12, minute: 0 }, { hour: 17, minute: 45 }], economyFarePence: 9900,  businessFarePence: 34900 },
  { origin: 'LHR', destination: 'ARN', durationMinutes: 150, departures: [{ hour: 9, minute: 0  }, { hour: 14, minute: 30 }, { hour: 20, minute: 0  }], economyFarePence: 9900,  businessFarePence: 34900 },
  { origin: 'CPH', destination: 'LHR', durationMinutes: 120, departures: [{ hour: 7, minute: 0  }, { hour: 13, minute: 0 }, { hour: 18, minute: 30 }], economyFarePence: 8500,  businessFarePence: 29900 },
  { origin: 'LHR', destination: 'CPH', durationMinutes: 120, departures: [{ hour: 8, minute: 30 }, { hour: 15, minute: 0 }, { hour: 20, minute: 30 }], economyFarePence: 8500,  businessFarePence: 29900 },
  { origin: 'OSL', destination: 'LHR', durationMinutes: 135, departures: [{ hour: 7, minute: 15 }, { hour: 12, minute: 45 }, { hour: 18, minute: 0 }], economyFarePence: 9200,  businessFarePence: 32500 },
  { origin: 'LHR', destination: 'OSL', durationMinutes: 135, departures: [{ hour: 9, minute: 30 }, { hour: 15, minute: 0 }, { hour: 20, minute: 15 }], economyFarePence: 9200,  businessFarePence: 32500 },
  { origin: 'HEL', destination: 'LHR', durationMinutes: 195, departures: [{ hour: 6, minute: 0  }, { hour: 13, minute: 0 }],                           economyFarePence: 12900, businessFarePence: 42900 },
  { origin: 'LHR', destination: 'HEL', durationMinutes: 195, departures: [{ hour: 10, minute: 0 }, { hour: 17, minute: 0 }],                           economyFarePence: 12900, businessFarePence: 42900 },

  // ── Scandinavia ↔ Manchester ──────────────────────────────────────────────
  { origin: 'ARN', destination: 'MAN', durationMinutes: 155, departures: [{ hour: 7, minute: 0  }, { hour: 16, minute: 0 }],                           economyFarePence: 10500, businessFarePence: 36900 },
  { origin: 'MAN', destination: 'ARN', durationMinutes: 155, departures: [{ hour: 10, minute: 30 }, { hour: 19, minute: 30 }],                         economyFarePence: 10500, businessFarePence: 36900 },
  { origin: 'CPH', destination: 'MAN', durationMinutes: 130, departures: [{ hour: 8, minute: 0  }, { hour: 17, minute: 0 }],                           economyFarePence: 9100,  businessFarePence: 31500 },
  { origin: 'MAN', destination: 'CPH', durationMinutes: 130, departures: [{ hour: 11, minute: 0 }, { hour: 20, minute: 0 }],                           economyFarePence: 9100,  businessFarePence: 31500 },

  // ── Intra-Scandinavian ────────────────────────────────────────────────────
  { origin: 'ARN', destination: 'CPH', durationMinutes: 75,  departures: [{ hour: 6, minute: 0  }, { hour: 11, minute: 0 }, { hour: 17, minute: 0 }, { hour: 21, minute: 0 }], economyFarePence: 5500, businessFarePence: 18900 },
  { origin: 'CPH', destination: 'ARN', durationMinutes: 75,  departures: [{ hour: 7, minute: 30 }, { hour: 12, minute: 30 }, { hour: 18, minute: 30 }, { hour: 22, minute: 0 }], economyFarePence: 5500, businessFarePence: 18900 },
  { origin: 'ARN', destination: 'OSL', durationMinutes: 60,  departures: [{ hour: 6, minute: 30 }, { hour: 11, minute: 30 }, { hour: 16, minute: 30 }, { hour: 20, minute: 30 }], economyFarePence: 4900, businessFarePence: 16500 },
  { origin: 'OSL', destination: 'ARN', durationMinutes: 60,  departures: [{ hour: 8, minute: 0  }, { hour: 13, minute: 0 }, { hour: 18, minute: 0 }, { hour: 22, minute: 0 }], economyFarePence: 4900, businessFarePence: 16500 },
  { origin: 'ARN', destination: 'HEL', durationMinutes: 55,  departures: [{ hour: 7, minute: 0  }, { hour: 12, minute: 0 }, { hour: 18, minute: 0 }], economyFarePence: 4500, businessFarePence: 15900 },
  { origin: 'HEL', destination: 'ARN', durationMinutes: 55,  departures: [{ hour: 9, minute: 0  }, { hour: 14, minute: 0 }, { hour: 20, minute: 0 }], economyFarePence: 4500, businessFarePence: 15900 },
  { origin: 'ARN', destination: 'GOT', durationMinutes: 55,  departures: [{ hour: 7, minute: 45 }, { hour: 13, minute: 45 }, { hour: 19, minute: 45 }], economyFarePence: 3900, businessFarePence: 13900 },
  { origin: 'GOT', destination: 'ARN', durationMinutes: 55,  departures: [{ hour: 9, minute: 15 }, { hour: 15, minute: 15 }, { hour: 21, minute: 15 }], economyFarePence: 3900, businessFarePence: 13900 },
  { origin: 'CPH', destination: 'OSL', durationMinutes: 65,  departures: [{ hour: 7, minute: 0  }, { hour: 13, minute: 0 }, { hour: 19, minute: 0 }], economyFarePence: 5100, businessFarePence: 17500 },
  { origin: 'OSL', destination: 'CPH', durationMinutes: 65,  departures: [{ hour: 8, minute: 30 }, { hour: 14, minute: 30 }, { hour: 20, minute: 30 }], economyFarePence: 5100, businessFarePence: 17500 },
  { origin: 'CPH', destination: 'HEL', durationMinutes: 105, departures: [{ hour: 8, minute: 0  }, { hour: 15, minute: 0 }],                           economyFarePence: 7200, businessFarePence: 23900 },
  { origin: 'HEL', destination: 'CPH', durationMinutes: 105, departures: [{ hour: 10, minute: 30 }, { hour: 17, minute: 30 }],                         economyFarePence: 7200, businessFarePence: 23900 },
  { origin: 'GOT', destination: 'CPH', durationMinutes: 65,  departures: [{ hour: 8, minute: 0  }, { hour: 14, minute: 0 }, { hour: 20, minute: 0 }], economyFarePence: 3800, businessFarePence: 13500 },
  { origin: 'CPH', destination: 'GOT', durationMinutes: 65,  departures: [{ hour: 9, minute: 30 }, { hour: 15, minute: 30 }, { hour: 21, minute: 30 }], economyFarePence: 3800, businessFarePence: 13500 },

  // ── Hub connections via AMS ───────────────────────────────────────────────
  { origin: 'AMS', destination: 'ARN', durationMinutes: 135, departures: [{ hour: 8, minute: 0  }, { hour: 14, minute: 30 }, { hour: 19, minute: 0 }], economyFarePence: 8200, businessFarePence: 28900 },
  { origin: 'ARN', destination: 'AMS', durationMinutes: 135, departures: [{ hour: 6, minute: 30 }, { hour: 12, minute: 0 }, { hour: 17, minute: 30 }], economyFarePence: 8200, businessFarePence: 28900 },
  { origin: 'AMS', destination: 'CPH', durationMinutes: 105, departures: [{ hour: 7, minute: 30 }, { hour: 13, minute: 0 }, { hour: 18, minute: 30 }], economyFarePence: 6900, businessFarePence: 23500 },
  { origin: 'CPH', destination: 'AMS', durationMinutes: 105, departures: [{ hour: 9, minute: 0  }, { hour: 14, minute: 30 }, { hour: 20, minute: 0 }], economyFarePence: 6900, businessFarePence: 23500 },
  { origin: 'AMS', destination: 'OSL', durationMinutes: 115, departures: [{ hour: 8, minute: 0  }, { hour: 15, minute: 0 }],                           economyFarePence: 7500, businessFarePence: 25900 },
  { origin: 'OSL', destination: 'AMS', durationMinutes: 115, departures: [{ hour: 10, minute: 30 }, { hour: 17, minute: 30 }],                         economyFarePence: 7500, businessFarePence: 25900 },
  { origin: 'AMS', destination: 'LHR', durationMinutes: 75,  departures: [{ hour: 7, minute: 0  }, { hour: 11, minute: 0 }, { hour: 16, minute: 0 }, { hour: 20, minute: 0 }], economyFarePence: 4500, businessFarePence: 15900 },
  { origin: 'LHR', destination: 'AMS', durationMinutes: 75,  departures: [{ hour: 8, minute: 30 }, { hour: 12, minute: 30 }, { hour: 17, minute: 30 }, { hour: 21, minute: 0 }], economyFarePence: 4500, businessFarePence: 15900 },
  { origin: 'AMS', destination: 'HEL', durationMinutes: 165, departures: [{ hour: 9, minute: 0  }, { hour: 16, minute: 0 }],                           economyFarePence: 11500, businessFarePence: 38900 },
  { origin: 'HEL', destination: 'AMS', durationMinutes: 165, departures: [{ hour: 7, minute: 0  }, { hour: 14, minute: 0 }],                           economyFarePence: 11500, businessFarePence: 38900 },

  // ── Hub connections via CDG ───────────────────────────────────────────────
  { origin: 'CDG', destination: 'ARN', durationMinutes: 155, departures: [{ hour: 7, minute: 0  }, { hour: 14, minute: 0 }],                           economyFarePence: 9500,  businessFarePence: 33900 },
  { origin: 'ARN', destination: 'CDG', durationMinutes: 155, departures: [{ hour: 10, minute: 30 }, { hour: 17, minute: 30 }],                         economyFarePence: 9500,  businessFarePence: 33900 },
  { origin: 'CDG', destination: 'CPH', durationMinutes: 120, departures: [{ hour: 8, minute: 0  }, { hour: 15, minute: 30 }],                          economyFarePence: 8100,  businessFarePence: 27900 },
  { origin: 'CPH', destination: 'CDG', durationMinutes: 120, departures: [{ hour: 10, minute: 30 }, { hour: 18, minute: 0 }],                          economyFarePence: 8100,  businessFarePence: 27900 },
  { origin: 'CDG', destination: 'LHR', durationMinutes: 75,  departures: [{ hour: 7, minute: 30 }, { hour: 12, minute: 0 }, { hour: 17, minute: 30 }, { hour: 21, minute: 0 }], economyFarePence: 4200, businessFarePence: 14900 },
  { origin: 'LHR', destination: 'CDG', durationMinutes: 75,  departures: [{ hour: 9, minute: 0  }, { hour: 13, minute: 30 }, { hour: 19, minute: 0 }, { hour: 22, minute: 0 }], economyFarePence: 4200, businessFarePence: 14900 },

  // ── Dublin routes ─────────────────────────────────────────────────────────
  { origin: 'DUB', destination: 'LHR', durationMinutes: 80,  departures: [{ hour: 6, minute: 30 }, { hour: 11, minute: 0 }, { hour: 16, minute: 30 }, { hour: 20, minute: 0 }], economyFarePence: 4900, businessFarePence: 16900 },
  { origin: 'LHR', destination: 'DUB', durationMinutes: 80,  departures: [{ hour: 8, minute: 0  }, { hour: 13, minute: 0 }, { hour: 18, minute: 0 }, { hour: 21, minute: 30 }], economyFarePence: 4900, businessFarePence: 16900 },
  { origin: 'DUB', destination: 'ARN', durationMinutes: 165, departures: [{ hour: 7, minute: 0  }, { hour: 15, minute: 0 }],                           economyFarePence: 11200, businessFarePence: 37900 },
  { origin: 'ARN', destination: 'DUB', durationMinutes: 165, departures: [{ hour: 10, minute: 0 }, { hour: 18, minute: 0 }],                           economyFarePence: 11200, businessFarePence: 37900 },
  { origin: 'DUB', destination: 'CPH', durationMinutes: 150, departures: [{ hour: 8, minute: 0  }, { hour: 16, minute: 30 }],                          economyFarePence: 10200, businessFarePence: 34900 },
  { origin: 'CPH', destination: 'DUB', durationMinutes: 150, departures: [{ hour: 11, minute: 0 }, { hour: 19, minute: 30 }],                          economyFarePence: 10200, businessFarePence: 34900 },
  { origin: 'DUB', destination: 'AMS', durationMinutes: 110, departures: [{ hour: 7, minute: 30 }, { hour: 14, minute: 0 }, { hour: 19, minute: 30 }], economyFarePence: 7200,  businessFarePence: 24900 },
  { origin: 'AMS', destination: 'DUB', durationMinutes: 110, departures: [{ hour: 9, minute: 30 }, { hour: 16, minute: 0 }, { hour: 21, minute: 30 }], economyFarePence: 7200,  businessFarePence: 24900 },

  // ── Gothenburg hub feeds ──────────────────────────────────────────────────
  { origin: 'GOT', destination: 'LHR', durationMinutes: 145, departures: [{ hour: 7, minute: 30 }, { hour: 15, minute: 0 }],                           economyFarePence: 9400,  businessFarePence: 32900 },
  { origin: 'LHR', destination: 'GOT', durationMinutes: 145, departures: [{ hour: 10, minute: 30 }, { hour: 18, minute: 0 }],                          economyFarePence: 9400,  businessFarePence: 32900 },
  { origin: 'GOT', destination: 'AMS', durationMinutes: 120, departures: [{ hour: 8, minute: 0  }, { hour: 16, minute: 0 }],                           economyFarePence: 7800,  businessFarePence: 26900 },
  { origin: 'AMS', destination: 'GOT', durationMinutes: 120, departures: [{ hour: 10, minute: 30 }, { hour: 18, minute: 30 }],                         economyFarePence: 7800,  businessFarePence: 26900 },
];

// ─── Flight number generation ──────────────────────────────────────────────────

const counters: Record<string, number> = {};

function cp(s: string, i: number): number {
  return s.codePointAt(i) ?? 0;
}

function nextFlightNumber(origin: string, destination: string): string {
  const key = `${origin}${destination}`;
  if (counters[key] === undefined) {
    const base =
      ((cp(origin, 0) + cp(origin, 1) + cp(origin, 2) +
        cp(destination, 0) + cp(destination, 1) + cp(destination, 2)) *
        7) %
        900 +
      100;
    counters[key] = base;
  }
  const current = counters[key];
  counters[key] = current + 1;
  return `SK${current}`;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const db = getDb();

  console.log('Seeding airports…');
  await db
    .insert(airports)
    .values(AIRPORTS.map((a) => ({ ...a })))
    .onConflictDoNothing();
  console.log(`  ${AIRPORTS.length} airports (skipped existing)`);

  console.log('Generating flights for 31 days…');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const DAYS = 31;
  const flightRows: (typeof flights.$inferInsert)[] = [];

  for (let d = 0; d < DAYS; d++) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + d);

    for (const route of ROUTES) {
      for (const dep of route.departures) {
        const departureAt = new Date(date);
        departureAt.setUTCHours(dep.hour, dep.minute, 0, 0);

        const arrivalAt = new Date(departureAt);
        arrivalAt.setUTCMinutes(arrivalAt.getUTCMinutes() + route.durationMinutes);

        flightRows.push({
          flightNumber: nextFlightNumber(route.origin, route.destination),
          originIata: route.origin,
          destinationIata: route.destination,
          departureAt,
          arrivalAt,
          economySeatsTotal: 150,
          economySeatsAvailable: 150,
          businessSeatsTotal: 24,
          businessSeatsAvailable: 24,
          economyFarePence: route.economyFarePence,
          businessFarePence: route.businessFarePence,
        });
      }
    }
  }

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < flightRows.length; i += BATCH) {
    await db.insert(flights).values(flightRows.slice(i, i + BATCH)).onConflictDoNothing();
    inserted += Math.min(BATCH, flightRows.length - i);
    process.stdout.write(`  ${inserted}/${flightRows.length} written\r`);
  }

  console.log(`\nDone — ${AIRPORTS.length} airports, ${flightRows.length} flights over ${DAYS} days`);

  await db.execute(sql`SELECT 1`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
