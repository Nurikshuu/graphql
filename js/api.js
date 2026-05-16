const API = (() => {
  const GQL_URL = 'https://01.tomorrow-school.ai/api/graphql-engine/v1/graphql';

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

  async function getXPTransactions() {
    const data = await query(`
      {
        transaction(
          where: {
            type: { _eq: "xp" }
          }
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

  async function getResults() {
    const data = await query(`
      {
        result(
          where: { isLast: { _eq: true } }
        ) {
          id
          grade
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

  async function getSkills() {
    const data = await query(`
      {
        transaction(
          where: { type: { _like: "skill_%" } }
          order_by: { amount: desc }
          limit: 9999
        ) {
          type
          amount
          objectId
        }
      }
    `);
    return data.transaction ?? [];
  }

  async function fetchAll() {
    const [user, xp, results, skills] = await Promise.all([
      getUser(),
      getXPTransactions(),
      getResults(),
      getSkills(),
    ]);
    return { user, xp, results, skills };
  }

  return {
    query,
    getUser,
    getXPTransactions,
    getResults,
    getSkills,
    fetchAll,
  };
})();
