// In-memory stand-in for the Mongo inventory store. tryHold() is atomic once it runs
// (like Mongo's conditional update); the random delay before it interleaves concurrent callers.
export function memoryStore(rows) {
  const key = (r, d) => `${r}|${d}`;
  const map = new Map(rows.map((r) => [key(r.roomType, r.date), { ...r }]));
  const sleep = () => new Promise((res) => setTimeout(res, Math.random() * 5));
  return {
    map,
    async tryHold(roomType, date, qty) {
      await sleep();
      const row = map.get(key(roomType, date));
      if (!row || row.blackout || row.sold + qty > row.allotment) return false;
      row.sold += qty;
      return true;
    },
    async release(roomType, date, qty) {
      await sleep();
      const row = map.get(key(roomType, date));
      if (row && row.sold >= qty) row.sold -= qty;
    },
    sold: (roomType, date) => map.get(key(roomType, date)).sold,
  };
}
