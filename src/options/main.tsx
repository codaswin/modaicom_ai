import { createRoot } from 'react-dom/client'

import { Options } from './Options'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Options root element was not found')
}

createRoot(root).render(<Options />)
