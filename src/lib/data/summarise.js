/**
 * The dashboard strip, computed from raw rows (plan 7.1).
 *
 * Its own module because BOTH adapters need it and neither may import the
 * other: the Supabase adapter pulls in `next/headers`, which does not exist
 * outside the Next runtime, so a demo adapter that imported it would break
 * `npm run dev` and every unit test.
 *
 * Accepts snake_case or camelCase for the date fields, because the Supabase
 * adapter hands over raw PostgREST rows here (no mapping step, to keep the
 * count query cheap) while the demo store is already camelCase.
 */
export function summarise(units = [], reservations = [], unreadCount = 0) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const withinToday = (value) => {
    const t = Date.parse(value);
    return Number.isFinite(t) && t >= startOfDay.getTime() && t < endOfDay.getTime();
  };
  const count = (rows, value) => rows.filter((r) => r.status === value).length;

  return {
    units: {
      total: units.length,
      available: count(units, 'available'),
      reserved: count(units, 'reserved'),
      rented: count(units, 'rented'),
      cleaning: count(units, 'cleaning'),
      /* Maintenance and out-of-service read the same to an operator: the car
         cannot be rented today. */
      maintenance: count(units, 'maintenance') + count(units, 'out_of_service'),
    },
    today: {
      departures: reservations.filter((r) => withinToday(r.start_at ?? r.startAt)).length,
      returns: reservations.filter((r) => withinToday(r.end_at ?? r.endAt)).length,
    },
    pending: count(reservations, 'pending'),
    active: count(reservations, 'active'),
    unread: unreadCount,
  };
}
