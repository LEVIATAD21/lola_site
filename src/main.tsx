import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Vite folds import.meta.env.PROD at build time: the production bundle cannot
// import the legacy example catalog, mock checkout, profile or mock imagery.
const App = import.meta.env.PROD
  ? lazy(() => import('./ProductionApp.tsx'))
  : lazy(() => import('./App.tsx'));

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');

createRoot(root).render(
  <Suspense fallback={
    <main className="min-h-screen flex items-center justify-center bg-[#F8F4ED] text-[#2A211B]" role="status">
      Carregando loja LOLA...
    </main>
  }>
    <App />
  </Suspense>
);
