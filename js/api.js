/**
 * api.js — GraphQL query layer
 *
 * Uses all three required query styles:
 *   1. Normal (no arguments):     getUser, getSkills
 *   2. With arguments (where/order_by): getXPTransactions, getResults, getAuditTransactions
 *   3. Nested (related tables):   getResults (→ object), getProgress (→ object), getObject
 */

const API = (() => {
  const GQL_URL = 'https://01.tomorrow-school.ai/api/graphql-engine/v1/graphql';

  // ── Core fetch ────────────────────────────────────────────────────
  async function query(gql, variables = {}) {
    const token = Auth.getToken();
    if (!token) throw new Error('Not authenticated');

    let response;
    try {
      response = await fetch(GQL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gql, variables }),
      });
    } catch {
      throw new Error('Network error while querying GraphQL.');
    }

    if (response.status === 401 || response.status === 403) {
      Auth.logout();
      throw new Error('Session expired. Please log in again.');
    }
    if (!response.ok) throw new Error(`GraphQL HTTP error ${response.status}`);

    const result = await response.json();
    if (result.errors?.length) {
      throw new Error(result.errors.map(e => e.message).join(' | '));
    }
    return result.data;
  }

  // ── 1. NORMAL QUERY — user basic info ─────────────────────────────
  async function getUser() {
    const data = await query(`
      {
        user {
          id
          login
          totalUp
          totalDown
          auditRatio
          createdAt
          campus
        }
      }
    `);
    return data.user?.[0] ?? null;
  }

  // ── 2. QUERY WITH ARGUMENTS — XP transactions ────────────────────
  async function getXPTransactions() {
    const data = await query(`
      {
        transaction(
          where: { type: { _eq: "xp" } }
          order_by: { createdAt: asc }
        ) {
          id
          amount
          createdAt
          path
          objectId
        }
      }
    `);
    return data.transaction ?? [];
  }

  // ── 3. NESTED QUERY — results with related object info ───────────
  async function getResults() {
    const data = await query(`
      {
        result(
          order_by: { createdAt: desc }
          limit: 200
        ) {
          id
          grade
          type
          createdAt
          path
          objectId
          object {
            name
            type
          }
        }
      }
    `);
    return data.result ?? [];
  }

  // ── NORMAL QUERY — skill transactions ────────────────────────────
  async function getSkills() {
    const data = await query(`
      {
        transaction(
          where: { type: { _like: "skill_%" } }
          order_by: { amount: desc }
        ) {
          type
          amount
          objectId
        }
      }
    `);
    return data.transaction ?? [];
  }

  // ── QUERY WITH ARGUMENTS — audit up/down transactions ────────────
  async function getAuditTransactions() {
    const data = await query(`
      {
        transaction(
          where: {
            _or: [
              { type: { _eq: "up" } }
              { type: { _eq: "down" } }
            ]
          }
          order_by: { createdAt: asc }
        ) {
          id
          type
          amount
          createdAt
          path
        }
      }
    `);
    return data.transaction ?? [];
  }

  // ── NESTED QUERY WITH ARGUMENTS — single object by ID ────────────
  async function getObject(id) {
    const data = await query(
      `
      query GetObject($id: Int!) {
        object(where: { id: { _eq: $id } }) {
          id
          name
          type
          attrs
        }
      }
    `,
      { id }
    );
    return data.object?.[0] ?? null;
  }

  // ── NESTED QUERY — progress with object info ─────────────────────
  async function getProgress() {
    const data = await query(`
      {
        progress(
          order_by: { updatedAt: desc }
          limit: 100
        ) {
          id
          objectId
          grade
          createdAt
          updatedAt
          path
          object {
            name
            type
          }
        }
      }
    `);
    return data.progress ?? [];
  }

  // ── Fetch everything needed for the profile in one pass ───────────
  async function fetchAll() {
    const [user, xp, results, skills, progress] = await Promise.all([
      getUser(),
      getXPTransactions(),
      getResults(),
      getSkills(),
      getProgress(),
    ]);
    return { user, xp, results, skills, progress };
  }

  return {
    query,
    getUser,
    getXPTransactions,
    getResults,
    getSkills,
    getAuditTransactions,
    getObject,
    getProgress,
    fetchAll,
  };
})();
