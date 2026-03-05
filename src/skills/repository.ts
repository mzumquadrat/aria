import { getDatabase } from "../storage/sqlite.ts";
import { generateUUIDv4 } from "../storage/uuid.ts";
import type { SkillDefinition, SkillRecord } from "./types.ts";

function rowToSkillRecord(row: Record<string, unknown>): SkillRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    code: row.code as string,
    schema: row.schema as string,
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at as string),
  };
}

export function createSkill(skill: SkillDefinition): SkillRecord {
  const db = getDatabase();
  const id = generateUUIDv4();
  const schema = JSON.stringify({
    input: skill.inputSchema,
    output: skill.outputSchema,
    examples: skill.examples,
    author: skill.author,
    version: skill.version,
    tags: skill.tags,
  });

  db.run(
    `INSERT INTO skills (id, name, description, code, schema, enabled) VALUES (?, ?, ?, ?, ?, 1)`,
    id,
    skill.name,
    skill.description,
    skill.code,
    schema,
  );

  return {
    id,
    name: skill.name,
    description: skill.description,
    code: skill.code,
    schema,
    enabled: true,
    createdAt: new Date(),
  };
}

export function getSkillById(id: string): SkillRecord | null {
  const db = getDatabase();
  const row = db.queryOne<Record<string, unknown>>(
    "SELECT * FROM skills WHERE id = ?",
    id,
  );
  return row ? rowToSkillRecord(row) : null;
}

export function getSkillByName(name: string): SkillRecord | null {
  const db = getDatabase();
  const row = db.queryOne<Record<string, unknown>>(
    "SELECT * FROM skills WHERE name = ?",
    name,
  );
  return row ? rowToSkillRecord(row) : null;
}

export function getAllSkills(enabledOnly: boolean = false): SkillRecord[] {
  const db = getDatabase();
  const sql = enabledOnly
    ? "SELECT * FROM skills WHERE enabled = 1 ORDER BY created_at DESC"
    : "SELECT * FROM skills ORDER BY created_at DESC";
  const rows = db.query<Record<string, unknown>>(sql);
  return rows.map(rowToSkillRecord);
}

export function updateSkill(
  id: string,
  updates: Partial<SkillDefinition>,
): Promise<SkillRecord | null> {
  const db = getDatabase();
  const existing = getSkillById(id);
  if (!existing) return Promise.resolve(null);

  const schema = JSON.parse(existing.schema);

  if (updates.name) {
    db.run("UPDATE skills SET name = ? WHERE id = ?", updates.name, id);
  }
  if (updates.description !== undefined) {
    db.run("UPDATE skills SET description = ? WHERE id = ?", updates.description, id);
  }
  if (updates.code) {
    db.run("UPDATE skills SET code = ? WHERE id = ?", updates.code, id);
  }

  const newSchema = {
    ...schema,
    input: updates.inputSchema ?? schema.input,
    output: updates.outputSchema ?? schema.output,
    examples: updates.examples ?? schema.examples,
    author: updates.author ?? schema.author,
    version: updates.version ?? schema.version,
    tags: updates.tags ?? schema.tags,
  };
  db.run("UPDATE skills SET schema = ? WHERE id = ?", JSON.stringify(newSchema), id);

  return Promise.resolve(getSkillById(id));
}

export function deleteSkill(id: string): boolean {
  const db = getDatabase();
  const existing = getSkillById(id);
  if (!existing) return false;

  db.run("DELETE FROM skills WHERE id = ?", id);
  return true;
}

export function enableSkill(id: string): boolean {
  const db = getDatabase();
  const existing = getSkillById(id);
  if (!existing) return false;

  db.run("UPDATE skills SET enabled = 1 WHERE id = ?", id);
  return true;
}

export function disableSkill(id: string): boolean {
  const db = getDatabase();
  const existing = getSkillById(id);
  if (!existing) return false;

  db.run("UPDATE skills SET enabled = 0 WHERE id = ?", id);
  return true;
}

export function searchSkills(query: string): SkillRecord[] {
  const db = getDatabase();
  const sql = `
    SELECT * FROM skills 
    WHERE name LIKE ? OR description LIKE ? OR code LIKE ?
    ORDER BY created_at DESC
  `;
  const searchTerm = `%${query}%`;
  const rows = db.query<Record<string, unknown>>(sql, searchTerm, searchTerm, searchTerm);
  return rows.map(rowToSkillRecord);
}

export function skillRecordToDefinition(record: SkillRecord): SkillDefinition {
  const schema = JSON.parse(record.schema);
  return {
    name: record.name,
    description: record.description,
    code: record.code,
    inputSchema: schema.input,
    outputSchema: schema.output,
    examples: schema.examples,
    author: schema.author,
    version: schema.version,
    tags: schema.tags,
  };
}
