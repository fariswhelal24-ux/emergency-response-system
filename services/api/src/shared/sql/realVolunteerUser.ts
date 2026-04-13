/**
 * SQL fragment: `users` row must be aliased as `u` (joined from `volunteers` `v`).
 * Excludes demo / system accounts used for dispatcher & local testing (@rapidaid.local).
 */
export const realVolunteerUserConditions = `
  u.role = 'VOLUNTEER'
  AND u.is_active = TRUE
  AND u.email NOT ILIKE '%@rapidaid.local'
`.trim();
