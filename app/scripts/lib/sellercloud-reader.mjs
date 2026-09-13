export function sellerCloudReader(env, transport = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const base = env.SELLERCLOUD_DELTA_BASE?.replace(/\/$/, '')
  if (!base || !env.SELLERCLOUD_USERNAME || !env.SELLERCLOUD_PASSWORD) throw new Error('Missing SellerCloud connection settings')
  let tokenPromise
  async function request(path, body, token) {
    for (let attempt = 0; attempt < 6; attempt++) {
      let response
      try {
        response = await transport(`${base}${path}`, {
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}) },
          ...(body ? {body: JSON.stringify(body)} : {}),
          signal: AbortSignal.timeout(120000),
        })
        if (response.ok) return await response.json()
        if (response.status === 401) throw Object.assign(new Error('SellerCloud authentication expired'), {status:401})
        if (![429,500,502,503,504].includes(response.status)) throw Object.assign(new Error(`SellerCloud HTTP ${response.status}`), {status:response.status})
      } catch (error) {
        if (error.status || attempt === 5) throw error
      }
      if (attempt === 5) throw new Error('SellerCloud retry limit exceeded')
      const retryAfter = Number(response?.headers.get('retry-after') ?? 0)
      await sleep(Math.min(60000, Math.max(retryAfter*1000, 2000*2**attempt)))
    }
  }
  async function authenticate() {
    const result = await request('/api/token', {Username:env.SELLERCLOUD_USERNAME,Password:env.SELLERCLOUD_PASSWORD})
    const token = result.access_token || result.AccessToken
    if (!token) throw new Error('Missing SellerCloud token')
    return token
  }
  return async (path,body) => {
    for (let attempt=0;attempt<2;attempt++) {
      tokenPromise ??= authenticate().catch(error=>{tokenPromise=null;throw error})
      const token=await tokenPromise
      try { return await request(path,body,token) }
      catch(error){if(error.status!==401||attempt===1)throw error;tokenPromise=null}
    }
  }
}
