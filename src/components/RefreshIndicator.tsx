"use client";

import { useEffect, useState } from "react";

const CRON_INTERVAL_MIN = 15;

export default function RefreshIndicator() {
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [ago, setAgo] = useState("");
  const [nextIn, setNextIn] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/factors");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.updated) setLastUpdate(json.updated);
      } catch { /* silent */ }
    }
    check();
    const iv = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    function tick() {
      if (!lastUpdate) { setAgo("—"); setNextIn("—"); return; }
      const updatedAt = new Date(lastUpdate).getTime();
      const now = Date.now();
      const diffMs = now - updatedAt;
      const diffMin = Math.floor(diffMs / 60_000);

      if (diffMin < 1) setAgo("just now");
      else if (diffMin < 60) setAgo(`${diffMin}m ago`);
      else setAgo(`${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`);

      const nextMs = CRON_INTERVAL_MIN * 60_000 - (diffMs % (CRON_INTERVAL_MIN * 60_000));
      const nextMin = Math.ceil(nextMs / 60_000);
      setNextIn(nextMin <= 1 ? "< 1m" : `~${nextMin}m`);
    }
    tick();
    const iv = setInterval(tick, 15_000);
    return () => clearInterval(iv);
  }, [lastUpdate]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 10, color: "var(--text-secondary)",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: lastUpdate ? "#3fb950" : "#d29922",
        animation: lastUpdate ? "none" : "pulse 2s infinite",
        flexShrink: 0,
      }} />
      <span>Updated {ago}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>Next refresh {nextIn}</span>
    </div>
  );
}
