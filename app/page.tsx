"use client";

import GraphCanvas from '../components/GraphCanvas';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', overflowX: 'auto' }}>
      <GraphCanvas />
    </main>
  );
}