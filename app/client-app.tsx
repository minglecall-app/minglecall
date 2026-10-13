'use client';

import dynamic from 'next/dynamic';

/** Existing client shell. ssr:false avoids window and localStorage during server render. */
const App = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#09090C',
        color: '#E4E4EC',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Loading LiveCall…
    </div>
  ),
});

export default function ClientApp() {
  return <App />;
}
