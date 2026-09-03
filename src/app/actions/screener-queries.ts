'use server';

import { prisma } from '@/lib/db';
import type { ScreenerQueryFilters } from '@/lib/screener/filter-query';

export type ScreenerBaseTab = 'all' | 'prefiltered' | 'portfolio';

export interface SavedQuery {
  id: number;
  name: string;
  baseTab: ScreenerBaseTab;
  filters: ScreenerQueryFilters;
  sortField: string | null;
  sortDir: 'asc' | 'desc' | null;
  isDefault: boolean;
}

function toBaseTab(v: string): ScreenerBaseTab {
  return v === 'all' || v === 'portfolio' ? v : 'prefiltered';
}

function parseRow(row: {
  id: number;
  name: string;
  baseTab: string;
  filters: string;
  sortField: string | null;
  sortDir: string | null;
  isDefault: boolean;
}): SavedQuery {
  let filters: ScreenerQueryFilters = {};
  try {
    filters = JSON.parse(row.filters || '{}') as ScreenerQueryFilters;
  } catch {
    filters = {};
  }
  return {
    id: row.id,
    name: row.name,
    baseTab: toBaseTab(row.baseTab),
    filters,
    sortField: row.sortField,
    sortDir: row.sortDir === 'asc' || row.sortDir === 'desc' ? row.sortDir : null,
    isDefault: row.isDefault,
  };
}

export async function listScreenerQueries(): Promise<SavedQuery[]> {
  const rows = await prisma.screenerQuery.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows.map(parseRow);
}

export interface SaveScreenerQueryInput {
  id?: number | null;
  name: string;
  baseTab: ScreenerBaseTab;
  filters: ScreenerQueryFilters;
  sortField?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  isDefault?: boolean;
  /** When true, always create a brand-new query and reject duplicate names
   *  (instead of upserting-by-name). Used by the "Add query" action. */
  createNew?: boolean;
}

export async function saveScreenerQuery(
  input: SaveScreenerQueryInput,
): Promise<{ success: boolean; query?: SavedQuery; error?: string }> {
  const name = input.name?.trim();
  if (!name) return { success: false, error: 'Please enter a name for the query.' };
  if (name.length > 60) return { success: false, error: 'Name must be 60 characters or fewer.' };

  const data = {
    name,
    baseTab: input.baseTab,
    filters: JSON.stringify(input.filters ?? {}),
    sortField: input.sortField ?? null,
    sortDir: input.sortDir ?? null,
    isDefault: input.isDefault ?? false,
  };

  try {
    // Enforce a single default: clear others first when this one is default.
    if (data.isDefault) {
      await prisma.screenerQuery.updateMany({
        where: input.id ? { NOT: { id: input.id } } : {},
        data: { isDefault: false },
      });
    }

    let row;
    if (input.createNew) {
      // Always create a fresh entry; refuse to clobber an existing name.
      const existing = await prisma.screenerQuery.findUnique({ where: { name } });
      if (existing) {
        return {
          success: false,
          error: `A query named "${name}" already exists. Choose a different name.`,
        };
      }
      row = await prisma.screenerQuery.create({ data });
    } else if (input.id) {
      row = await prisma.screenerQuery.update({ where: { id: input.id }, data });
    } else {
      // Upsert-by-name so re-saving with the same name overwrites instead of erroring.
      const existing = await prisma.screenerQuery.findUnique({ where: { name } });
      row = existing
        ? await prisma.screenerQuery.update({ where: { id: existing.id }, data })
        : await prisma.screenerQuery.create({ data });
    }
    return { success: true, query: parseRow(row) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteScreenerQuery(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.screenerQuery.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
