import { Pool } from 'pg';
import { normalizeNameForMatch } from '../utils/normalize';
import type { UserMapping } from '../types/task';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

// In-memory fallback for local dev without DB
const inMemoryMappings: UserMapping[] = [];

export function initDb(connectionString: string): void {
  pool = new Pool({ connectionString });
}

export function addInMemoryMapping(mapping: UserMapping): void {
  inMemoryMappings.push(mapping);
}

export async function findBasecampUser(
  nicknameTerm: string,
): Promise<UserMapping | null> {
  const normalized = normalizeNameForMatch(nicknameTerm);

  if (pool) {
    try {
      const result = await pool.query<UserMapping>(
        `SELECT * FROM user_mappings WHERE active = true AND LOWER(nickname) LIKE $1 LIMIT 1`,
        [`%${normalized}%`],
      );
      return result.rows[0] ?? null;
    } catch (err) {
      logger.warn({ err }, 'DB lookup failed — falling back to in-memory mappings');
    }
  }

  return (
    inMemoryMappings.find(
      (m) =>
        m.active &&
        normalizeNameForMatch(m.nickname).includes(normalized),
    ) ?? null
  );
}

export async function findSimilarUsers(
  nicknameTerm: string,
): Promise<UserMapping[]> {
  const normalized = normalizeNameForMatch(nicknameTerm);

  if (pool) {
    try {
      const result = await pool.query<UserMapping>(
        `SELECT * FROM user_mappings WHERE active = true ORDER BY nickname LIMIT 5`,
      );
      return result.rows.filter((r) =>
        normalizeNameForMatch(r.nickname).includes(normalized.slice(0, 3)),
      );
    } catch {
      // fallthrough
    }
  }

  return inMemoryMappings
    .filter(
      (m) =>
        m.active &&
        normalizeNameForMatch(m.nickname).includes(normalized.slice(0, 3)),
    )
    .slice(0, 5);
}
