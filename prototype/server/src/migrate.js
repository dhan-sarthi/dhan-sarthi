import { migrate, pool } from './db.js'
console.log('running migrations…')
await migrate()
console.log('done.')
await pool.end()
