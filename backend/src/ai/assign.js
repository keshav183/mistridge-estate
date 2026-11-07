// Who owns an enquiry? Lane -> role, then the least-loaded person in that role.
export const ROLE_FOR_LANE = { room: 'reservations', wedding: 'sales', offsite: 'sales', complaint: 'gm', unsorted: 'gm' };

export function pickOwner(users, openCounts) {
  if (!users.length) return null;
  return [...users].sort(
    (a, b) => (openCounts[a._id] || 0) - (openCounts[b._id] || 0) || a.name.localeCompare(b.name),
  )[0];
}
