/**
 * Unified knowledge graph — a thin, versioned relationship layer over the same
 * SQLite file. Deliberately not a graph database: edges are rows, traversal is a
 * bounded breadth-first walk, and every relation name is validated against a
 * whitelist so a typo cannot create an orphan ontology.
 */
import { LifeError } from './modelFabric.js';
import { nowIso, randomId } from './store.js';

export const ENTITY_TYPES = [
  'memory',
  'task',
  'skill',
  'experience',
  'evidence',
  'verification',
  'project',
  'conversation',
  'model',
  'user',
];

export const RELATIONS = [
  'EXPERIENCE_CREATED_SKILL',
  'TASK_USED_SKILL',
  'MEMORY_SUPPORTS_TASK',
  'EVIDENCE_VERIFIES_RESULT',
  'SKILL_DEPENDS_ON_SKILL',
  'PROJECT_ASSOCIATED_WITH_MEMORY',
  'TASK_PRODUCED_EXPERIENCE',
  'SKILL_PRODUCED_VERSION',
  'RELATED_TO',
];

export function createGraphService({ store, clock = () => new Date(), userId = 'local' } = {}) {
  if (!store) throw new Error('graph service needs a store');

  const validate = (type, id) => {
    if (!ENTITY_TYPES.includes(type)) throw new LifeError('INVALID_ENTITY_TYPE', `Unknown entity type: ${type}`, { status: 400 });
    if (typeof id !== 'string' || !id.trim()) throw new LifeError('INVALID_ENTITY_ID', 'An entity id is required.', { status: 400 });
    return { type, id: id.trim() };
  };

  const link = ({ from, relation, to, weight = 1 } = {}) => {
    if (!RELATIONS.includes(relation)) throw new LifeError('INVALID_RELATION', `Unknown relation: ${relation}`, { status: 400 });
    const source = validate(from?.type, from?.id);
    const target = validate(to?.type, to?.id);
    if (source.type === target.type && source.id === target.id) {
      throw new LifeError('SELF_LINK', 'An entity cannot be linked to itself.', { status: 400 });
    }
    const existing = store.queryOne(
      `select id from memory_links where user_id = ? and from_type = ? and from_id = ? and relation = ? and to_type = ? and to_id = ?`,
      [userId, source.type, source.id, relation, target.type, target.id],
    );
    if (existing) return { edge: existing.id, created: false };
    const id = randomId('edge');
    store.run(
      `insert into memory_links (id, user_id, from_type, from_id, relation, to_type, to_id, weight, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, source.type, source.id, relation, target.type, target.id, Number(weight) || 1, nowIso(clock)],
    );
    return { edge: id, created: true };
  };

  const unlink = (edgeId) => {
    const result = store.run('delete from memory_links where id = ? and user_id = ?', [edgeId, userId]);
    return { deleted: result.changes > 0 };
  };

  const edgesFor = (type, id) => {
    const entity = validate(type, id);
    return store
      .queryAll('select * from memory_links where user_id = ? and ((from_type = ? and from_id = ?) or (to_type = ? and to_id = ?))', [
        userId,
        entity.type,
        entity.id,
        entity.type,
        entity.id,
      ])
      .map((row) => ({
        id: row.id,
        from: { type: row.from_type, id: row.from_id },
        relation: row.relation,
        to: { type: row.to_type, id: row.to_id },
        weight: row.weight,
        createdAt: row.created_at,
        direction: row.from_type === entity.type && row.from_id === entity.id ? 'out' : 'in',
      }));
  };

  /** Bounded breadth-first walk; depth ≤ 3 so a shared id cannot fan out forever. */
  const neighbors = (type, id, { depth = 1, relation = null } = {}) => {
    const start = validate(type, id);
    const maxDepth = Math.min(Math.max(1, Number(depth) || 1), 3);
    const seen = new Set([`${start.type}:${start.id}`]);
    let frontier = [start];
    const nodes = [];
    const edges = [];
    for (let level = 0; level < maxDepth; level += 1) {
      const next = [];
      for (const node of frontier) {
        for (const edge of edgesFor(node.type, node.id)) {
          if (relation && edge.relation !== relation) continue;
          const other = edge.from.type === node.type && edge.from.id === node.id ? edge.to : edge.from;
          const key = `${other.type}:${other.id}`;
          edges.push({ ...edge, level });
          if (seen.has(key)) continue;
          seen.add(key);
          nodes.push({ ...other, level: level + 1 });
          next.push(other);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return { root: start, nodes, edges };
  };

  const stats = () => {
    const rows = store.queryAll(
      'select relation, count(*) as count from memory_links where user_id = ? group by relation order by count desc',
      [userId],
    );
    return {
      edges: rows.reduce((sum, row) => sum + row.count, 0),
      byRelation: Object.fromEntries(rows.map((row) => [row.relation, row.count])),
      entityTypes: ENTITY_TYPES,
      relations: RELATIONS,
    };
  };

  return { link, unlink, edgesFor, neighbors, stats, entityTypes: ENTITY_TYPES, relations: RELATIONS };
}
