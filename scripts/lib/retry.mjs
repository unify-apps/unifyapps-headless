/** Retry transient requests, never authentication or validation failures. */
export async function withRetry(operation, { attempts = 3, delays = [1000, 3000, 9000], sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (error.code !== 'PLATFORM_UNREACHABLE' || attempt === attempts - 1) throw error;
      await sleep(delays[attempt] ?? delays.at(-1));
    }
  }
}
