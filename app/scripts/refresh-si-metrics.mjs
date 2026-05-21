import { loadLocalEnv, refreshSiMetrics } from './lib/si-metrics-refresh.mjs'

loadLocalEnv()

const dryRun = process.argv.includes('--dry-run')

refreshSiMetrics({ dryRun })
  .then(result => {
    console.log(JSON.stringify(result, null, 2))
  })
  .catch(error => {
    console.error(error.message)
    process.exit(1)
  })
