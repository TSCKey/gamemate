import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Overlay from './Overlay'

// The floating Alt+Space window loads the same page with #overlay.
const isOverlay = window.location.hash === '#overlay'
document.documentElement.classList.toggle('is-overlay', isOverlay)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <Overlay /> : <App />}</StrictMode>
)
