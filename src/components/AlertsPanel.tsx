"use client";

import { formatDistanceToNow } from "date-fns";

export interface Alert {
  id: string;
  instrument: string;
  type: "regime_change" | "positioning_extreme" | "oi_spike" | "volume_surge";
  message: string;
  severity: "info" | "warn" | "critical";
  timestamp: string;
}

interface Props {
  alerts: Alert[];
}

const SEV_STYLE: Record<string, { bg: string; border: string; dot: string }> = {
  info:     { bg: "var(--alert-info-bg)",     border: "var(--alert-info-border)",     dot: "var(--info)" },
  warn:     { bg: "var(--alert-warn-bg)",     border: "var(--alert-warn-border)",     dot: "var(--warn)" },
  critical: { bg: "var(--alert-crit-bg)",     border: "var(--alert-crit-border)",     dot: "var(--bear)" },
};

export default function AlertsPanel({ alerts }: Props) {
  return (
    <div className="panel">
      <h3 className="panel-title">Alerts</h3>
      <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
        {alerts.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No active alerts</p>
        )}
        {alerts.map((a) => {
          const s = SEV_STYLE[a.severity] ?? SEV_STYLE.info;
          return (
            <div
              key={a.id}
              className="rounded-md px-3 py-2 text-sm border"
              style={{ background: s.bg, borderColor: s.border }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                <span className="font-medium">{a.instrument}</span>
                <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>
                  {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{a.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
