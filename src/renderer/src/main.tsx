import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './screens/App'
import Overlay from './screens/Overlay'
import Toast from './screens/Toast'
import { setupI18n } from './i18n'

setupI18n()

// The floating Alt+Space window and the comment pop-up load this same page with a #hash.
const view = window.location.hash.slice(1)
document.documentElement.classList.toggle('is-overlay', view === 'overlay' || view === 'toast')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'overlay' ? <Overlay /> : view === 'toast' ? <Toast /> : <App />}
  </StrictMode>
)
