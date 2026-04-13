"use client";

import GraphCanvas from '../components/GraphCanvas';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <GraphCanvas />
    </main>
  );
}