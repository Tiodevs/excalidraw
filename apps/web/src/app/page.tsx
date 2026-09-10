"use client";

import dynamic from "next/dynamic";

const ExcalidrawApp = dynamic(() => import("@/components/ExcalidrawApp"), {
  ssr: false,
  loading: () => (
    <div className="app-loading">
      <div>Carregando o editor…</div>
    </div>
  ),
});

export default function HomePage() {
  return <ExcalidrawApp />;
}
