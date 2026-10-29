"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeedButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn w-full text-[11px]"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const response = await fetch("/api/projects/seed", { method: "POST" });
          const payload = (await response.json()) as { project?: { id: string }; error?: string };
          if (payload.project) {
            router.push(`/projects/${payload.project.id}`);
          } else {
            router.refresh();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "در حال ساخت پروژه نمایشی…" : "ساخت / ورود به پروژه نمایشی"}
    </button>
  );
}
