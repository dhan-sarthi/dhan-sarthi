import { createRoot } from 'react-dom/client'

const el = document.getElementById('root')
if (!el) throw new Error('#root missing from index.html')
createRoot(el).render(<h1>Dhan Sarthi</h1>)
