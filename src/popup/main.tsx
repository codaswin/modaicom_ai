import { createRoot } from 'react-dom/client'

import { Popup } from './Popup'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Popup root element was not found')
}

createRoot(root).render(<Popup />)
