"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function WorkspaceAccess() {
  const router = useRouter();
  const [account, setAccount] = useState<{ username: string | null; hasRecovery: boolean } | null>(null);
  const [mode, setMode] = useState("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/workspace")
      .then(async (r) => {
        const data = await r.json();
        if (alive) {
          if (r.ok) setAccount(data);
          else setMessage(data.error);
        }
      })
      .catch(() => {
        if (alive) setMessage("خواندن وضعیت حساب ناموفق بود.");
      });
    return () => {
      alive = false;
    };
  }, []);
  const submit = async (action: string) => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, username, password, code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "عملیات ناموفق بود.");
      setRecovery(data.recovery ?? "");
      setPassword("");
      setCode("");
      const status = await fetch("/api/workspace");
      if (status.ok) setAccount(await status.json());
      setMessage(action === "logout" ? "خارج شدید؛ اکنون در فضای مهمان جدید هستید." : "انجام شد. کلید بازیابی را در محل امن نگه دارید.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطای ارتباط");
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([recovery + "\n"], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hermicad-recovery.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="panel p-4" aria-label="حساب و بازیابی فضای کار">
      <h2 className="text-sm font-bold text-teal-200">حساب و بازیابی فضای کار</h2>
      <p className="my-2 text-xs leading-6 text-slate-300">
        کار مهمان رایگان و بدون ثبت‌نام است. برای بازگشت پس از حذف کوکی، حساب اختیاری بسازید یا کلید بازیابی بگیرید. ورود، فضای کار را عوض
        می‌کند؛ اسناد مهمان خودکار ادغام نمی‌شوند.
      </p>
      {account?.username ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>حساب: {account.username}</span>
          <button className="btn" disabled={busy} onClick={() => submit("logout")}>
            خروج از حساب
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(mode);
          }}
          className="space-y-2"
        >
          <label className="block text-xs">
            عملیات حساب
            <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="register">ساخت حساب برای همین فضای کار</option>
              <option value="login">ورود به حساب موجود</option>
              <option value="recover">بازیابی با کلید</option>
            </select>
          </label>
          {mode !== "recover" ? (
            <label className="block text-xs">
              نام کاربری
              <input
                aria-label="نام کاربری"
                className="field"
                dir="ltr"
                value={username}
                minLength={3}
                maxLength={40}
                required
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
          ) : (
            <label className="block text-xs">
              کلید بازیابی
              <input
                aria-label="کلید بازیابی"
                className="field"
                dir="ltr"
                value={code}
                required
                autoComplete="off"
                maxLength={100}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <label className="block text-xs">
            {mode === "recover" ? "گذرواژهٔ جدید (برای حساب ثبت‌شده الزامی)" : "گذرواژه؛ حداقل ۱۲ نویسه"}
            <input
              aria-label="گذرواژه"
              type="password"
              className="field"
              dir="ltr"
              value={password}
              required={mode !== "recover"}
              minLength={12}
              maxLength={128}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "در حال انجام…" : mode === "register" ? "ساخت حساب" : mode === "login" ? "ورود" : "بازیابی فضای کار"}
          </button>
        </form>
      )}
      <button
        className="btn mt-3"
        disabled={busy}
        onClick={() => {
          if (!account?.hasRecovery || window.confirm("کلید قبلی لغو می‌شود. کلید جدید را ذخیره خواهید کرد؟")) void submit("recovery-key");
        }}
      >
        ساخت کلید بازیابی جدید
      </button>
      {recovery && (
        <div className="mt-3 rounded border border-amber-400/50 p-3 text-xs">
          <p>
            این کلید مانند گذرواژه است؛ برای دیگران نفرستید. فقط اکنون نمایش داده می‌شود. بازیابی، کلید قبلی و نشست‌های فعال را لغو می‌کند.
          </p>
          <code dir="ltr" className="my-2 block break-all select-all">
            {recovery}
          </code>
          <button className="btn" onClick={download}>
            دریافت فایل کلید
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 text-xs leading-6 text-amber-200">
          {message}
        </p>
      )}
    </section>
  );
}
