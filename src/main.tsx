import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FluxProvider } from '@/context/FluxContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluxProvider>
      <App />
    </FluxProvider>
  </StrictMode>,
)
