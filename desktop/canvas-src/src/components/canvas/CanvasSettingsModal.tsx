"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { signOut } from "next-auth/react";
import { useLocalePath } from "@/hooks/use-locale-path";
import {
  X,
  User,
  Lock,
  Crown,
  Coins,
  Settings,
  LogOut,
  Loader2,
  Check,
  Eye,
  EyeOff,
  TrendingUp,
  TrendingDown,
  Filter,
  Sparkles,
  FileText,
  Download,
  ExternalLink,
  RefreshCw,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Camera,
  Globe,
  Gift,
  Copy,
  Mail,
  CheckCircle as CheckCircleIcon,
  Bell,
  Info,
  AlertTriangle,
  Wrench,
  Pin,
} from "lucide-react";

/* ── Types ── */

interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  tier: string;
  role: string;
  email_verified: boolean;
  referral_code: string | null;
  created_at: string;
}

interface LedgerRecord {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  job_id: string | null;
  created_at: string;
}

interface Balance {
  balance: number;
  total_credited: number;
  total_debited: number;
}

interface CreditPack {
  id: string;
  xins: number;
  priceUsdCents: number;
  label: string;
  popular?: boolean;
  bonus?: string;
}

interface Invoice {
  id: string;
  number: string | null;
  amount_paid: number;
  currency: string;
  description: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

type TabId = "topup" | "billing" | "profile" | "notifications";

const TIER_KEYS: Record<string, string> = {
  FREE: "free",
  PRO: "pro",
  TEAM: "team",
};

const TYPE_KEYS: Record<string, string> = {
  CREDIT_PURCHASE: "typePurchase",
  CREDIT_GIFT: "typeGift",
  CREDIT_ADJUSTMENT: "typeAdjustment",
  CREDIT_SUBSCRIPTION: "typeSubscription",
  DEBIT_GENERATION: "typeGeneration",
  REFUND_GENERATION: "typeRefund",
  REFUND_GENERATION_PARTIAL: "typePartialRefund",
};

const TYPE_COLORS: Record<string, string> = {
  CREDIT_PURCHASE: "text-green-400",
  CREDIT_GIFT: "text-green-400",
  CREDIT_ADJUSTMENT: "text-yellow-400",
  CREDIT_SUBSCRIPTION: "text-[#CCFF00]",
  DEBIT_GENERATION: "text-red-400",
  REFUND_GENERATION: "text-blue-400",
  REFUND_GENERATION_PARTIAL: "text-blue-400",
};

/* ── Main Component ── */

interface CanvasSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

export function CanvasSettingsModal({ open, onClose, initialTab = "profile" }: CanvasSettingsModalProps) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const lp = useLocalePath();
  const t = useTranslations("profile");
  const ts = useTranslations("settings");
  const ta = useTranslations("auth");
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      fetch("/api/notifications/unread-count")
        .then((r) => r.json())
        .then((d) => setUnreadNotifCount(d.count ?? 0))
        .catch(() => {});
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const navGroups: { label: string; items: { id: TabId; icon: typeof Settings | null; label: string; logo?: boolean }[] }[] = [
    {
      label: ts("groupBilling"),
      items: [
        { id: "topup", icon: null, label: ts("topUp"), logo: true },
        { id: "billing", icon: Coins, label: ts("billingRecords") },
      ],
    },
    {
      label: ts("groupGeneral"),
      items: [
        { id: "profile", icon: Settings, label: ts("profileSettings") },
      ],
    },
    {
      label: ts("groupNotifications"),
      items: [
        { id: "notifications", icon: Bell, label: ts("notifications") },
      ],
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-[920px] h-[85vh] max-h-[720px] rounded-2xl border border-white/10 bg-[#111111] shadow-2xl overflow-hidden mx-4">
        {/* Sidebar */}
        <div className="w-52 shrink-0 flex flex-col bg-white/[0.02] border-r border-white/[0.06] p-3">
          <nav className="flex-1 space-y-4 pt-1">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-white/25 uppercase tracking-widest">
                  {group.label}
                </div>
                <div className="space-y-0.5 mt-1">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        tab === item.id
                          ? "bg-white/10 text-white font-medium"
                          : "text-white/50 hover:bg-white/5 hover:text-white/70"
                      }`}
                    >
                      {item.logo ? (
                        <img src="/infinite_logo.svg" alt="" className="h-4 w-4 shrink-0 brightness-0 invert opacity-70" />
                      ) : item.icon ? (
                        <item.icon size={15} className="shrink-0" />
                      ) : null}
                      {item.label}
                      {item.id === "notifications" && unreadNotifCount > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#CCFF00] text-[10px] text-black font-semibold px-1">
                          {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Version + Logout at bottom */}
          <div className="space-y-1 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-white/20">
              <RefreshCw size={13} className="shrink-0" />
              <span>v{buildId}</span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: lp("/") })}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={15} className="shrink-0" />
              {ta("logout")}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="h-12 shrink-0" />
          {tab === "topup" && <TopUpPanel />}
          {tab === "billing" && <BillingPanel />}
          {tab === "profile" && <ProfilePanel />}
          {tab === "notifications" && <NotificationsPanel onUnreadCountChange={setUnreadNotifCount} />}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex items-center justify-center size-8 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ══════════════════════════════════════════════════════════════
   Top-Up Panel
   ══════════════════════════════════════════════════════════════ */

const CURRENCY_OPTIONS = [
  { code: "usd" as const, symbol: "$", label: "USD", alipay: false },
  { code: "cny" as const, symbol: "¥", label: "CNY", alipay: true },
  { code: "myr" as const, symbol: "RM", label: "MYR", alipay: true },
];

function TopUpPanel() {
  const t = useTranslations("billing");
  const ts = useTranslations("settings");
  const tc = useTranslations("common");
  const [balance, setBalance] = useState<Balance | null>(null);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"usd" | "cny" | "myr">("usd");
  const [rates, setRates] = useState<{ CNY: number; MYR: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const purchasesDisabled = process.env.NEXT_PUBLIC_DISABLE_PURCHASES === "true";
  const currencyOpt = CURRENCY_OPTIONS.find((c) => c.code === currency)!;
  const currentRate = currency === "usd" ? 1 : currency === "cny" ? (rates?.CNY ?? 7.3) : (rates?.MYR ?? 4.5);

  const fetchData = useCallback(async () => {
    const [balRes, subRes] = await Promise.all([
      fetch("/api/billing/balance"),
      fetch("/api/subscription"),
    ]);
    if (balRes.ok) setBalance(await balRes.json());
    if (subRes.ok) {
      const data = await subRes.json();
      const packs: CreditPack[] = data.creditPacks ?? [];
      setCreditPacks(packs);
      if (packs.length > 0) {
        const popular = packs.find((p) => p.popular);
        setSelectedPack(popular?.id ?? packs[0].id);
      }
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch("/api/topup/rates").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setRates({ CNY: d.CNY, MYR: d.MYR });
    }).catch(() => {});
  }, []);

  const activePack = creditPacks.find((p) => p.id === selectedPack) ?? null;

  const handleBuyPack = async () => {
    if (!selectedPack) return;
    setBuyingPack(selectedPack);
    try {
      const res = await fetch("/api/topup/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: selectedPack, currency }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setToast(data.error?.message ?? t("createPaymentFailed"));
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast(tc("networkError"));
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBuyingPack(null);
    }
  };

  return (
    <div className="px-6 pb-6 space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-[300] flex items-center gap-2 rounded-xl bg-[#1a1a1a] border border-white/10 px-4 py-3 text-sm shadow-2xl animate-in fade-in slide-in-from-top-2">
          <Check size={14} className="text-[#CCFF00]" />
          {toast}
        </div>
      )}

      {/* Balance header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-full bg-[#CCFF00]/10">
            <img src="/infinite_logo.svg" alt="" className="h-5 w-5 brightness-0 invert" />
          </div>
          <div>
            <div className="text-sm font-medium text-white/50">{t("currentBalance")}</div>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-white tabular-nums">
            {balance?.balance != null ? balance.balance.toLocaleString() : "—"}
          </span>
          <span className="text-sm text-white/40">{t("xinsUnit")}</span>
        </div>
      </div>

      {/* Main content: two-column layout */}
      {creditPacks.length > 0 && !purchasesDisabled && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="grid grid-cols-5">
            {/* Left: pack selection */}
            <div className="col-span-3 p-5 space-y-4">
              <div>
                <div className="text-sm font-medium text-white/70 mb-1">
                  {ts("topUpSelectAmount")}
                </div>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-bold text-[#CCFF00]">
                    {activePack ? activePack.xins.toLocaleString() : "—"}
                  </span>
                  <span className="text-sm text-white/40">{t("xinsUnit")}</span>
                </div>
              </div>

              {/* Quick select buttons */}
              <div className="grid grid-cols-4 gap-2">
                {creditPacks.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => setSelectedPack(pack.id)}
                    className={`relative rounded-lg border px-3 py-2.5 text-center transition-all ${
                      selectedPack === pack.id
                        ? "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.05] hover:border-white/15"
                    }`}
                  >
                    {(pack.popular || pack.bonus) && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[#CCFF00] px-1.5 py-px text-[9px] font-bold text-black whitespace-nowrap">
                        {pack.bonus || t("popular")}
                      </span>
                    )}
                    <div className="text-sm font-bold tabular-nums">{pack.xins.toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: summary */}
            <div className="col-span-2 bg-white/[0.02] border-l border-white/[0.06]">
              <div className="p-5 space-y-4 h-full flex flex-col">
                <div className="space-y-3 flex-1">
                  {/* Credits to receive */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-white/50">{ts("topUpReceive")}</span>
                      <span className="text-xl font-bold text-[#CCFF00]">
                        {activePack ? activePack.xins.toLocaleString() : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/30">{ts("topUpRate")}</span>
                      <span className="text-xs font-medium text-white/60 border border-white/10 rounded-md px-2 py-0.5">
                        $1 = 100 {t("xinsUnit")}
                      </span>
                    </div>
                  </div>

                  <div className="h-px bg-white/[0.06]" />

                  {/* Currency selector */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/50">{ts("topUpCurrency")}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {CURRENCY_OPTIONS.map((opt) => (
                        <button
                          key={opt.code}
                          onClick={() => setCurrency(opt.code)}
                          className={`relative flex-1 rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-all ${
                            currency === opt.code
                              ? "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-white"
                              : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:border-white/15"
                          }`}
                        >
                          <span>{opt.symbol} {opt.label}</span>
                          {opt.alipay && (
                            <div className="text-[9px] text-[#CCFF00]/70 mt-0.5">
                              {ts("currencyAlipayHint")}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-white/[0.06]" />

                  {/* Payment amount */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white/50">{ts("topUpPayAmount")}</span>
                    <div className="text-right">
                      <div className="text-xl font-semibold text-white">
                        {activePack
                          ? `${currencyOpt.symbol}${(Math.ceil(activePack.priceUsdCents * currentRate) / 100).toFixed(currency === "usd" ? 0 : 2)}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA button */}
                <button
                  onClick={handleBuyPack}
                  disabled={buyingPack !== null || !selectedPack}
                  className="w-full h-10 rounded-lg bg-[#CCFF00] text-black text-sm font-semibold transition-colors hover:bg-[#CCFF00]/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {buyingPack ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : null}
                  {ts("topUpNow")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {purchasesDisabled && (
        <div className="text-center text-sm text-white/30 py-8">
          {t("purchasesDisabled")}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Invoices Panel
   ══════════════════════════════════════════════════════════════ */

function InvoicesPanel() {
  const t = useTranslations("billing");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={20} className="animate-spin text-white/20" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-white/25">
        <FileText size={28} className="mb-2 opacity-60" />
        <p className="text-xs">{t("noInvoices")}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="rounded-xl border border-white/[0.06] divide-y divide-white/[0.04] overflow-hidden">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between py-3 px-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white/80">
                {inv.number || inv.id.slice(0, 12)}
              </div>
              <p className="text-xs text-white/30 mt-0.5 truncate">
                {inv.description}
              </p>
            </div>
            <div className="text-sm font-semibold text-green-400 tabular-nums mx-4">
              ${(inv.amount_paid / 100).toFixed(2)}
            </div>
            <div className="text-[11px] text-white/20 tabular-nums w-20 text-right shrink-0">
              {new Date(inv.created * 1000).toLocaleDateString("zh-CN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
            <div className="flex items-center gap-1.5 ml-3 shrink-0">
              {inv.hosted_invoice_url && (
                <a
                  href={inv.hosted_invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center size-8 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
                  title={t("viewInvoice")}
                >
                  <ExternalLink size={14} />
                </a>
              )}
              {inv.invoice_pdf && (
                <a
                  href={inv.invoice_pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center size-8 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
                  title={t("downloadPdf")}
                >
                  <Download size={14} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Avatar Crop Modal
   ══════════════════════════════════════════════════════════════ */

function AvatarCropModal({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const ts = useTranslations("settings");
  const tc = useTranslations("common");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  const CANVAS_SIZE = 320;
  const OUTPUT_SIZE = 512;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const scale = CANVAS_SIZE / Math.min(img.width, img.height);
      setZoom(scale);
      setOffset({ x: 0, y: 0 });
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const dw = img.width * zoom;
    const dh = img.height * zoom;
    const dx = (CANVAS_SIZE - dw) / 2 + offset.x;
    const dy = (CANVAS_SIZE - dh) / 2 + offset.y;
    ctx.drawImage(img, dx, dy, dw, dh);

    // Dark overlay outside circle (rectangle with circle hole via evenodd)
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 4, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();

    // Circle border
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [zoom, offset]);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const clampOffset = (ox: number, oy: number, z: number) => {
    const img = imgRef.current;
    if (!img) return { x: ox, y: oy };
    const dw = img.width * z;
    const dh = img.height * z;
    // Max offset so image edge doesn't enter the circle
    const maxX = Math.max(0, (dw - CANVAS_SIZE) / 2);
    const maxY = Math.max(0, (dh - CANVAS_SIZE) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const raw = {
      x: offsetStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetStart.current.y + (e.clientY - dragStart.current.y),
    };
    setOffset(clampOffset(raw.x, raw.y, zoom));
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = OUTPUT_SIZE;
    offscreen.height = OUTPUT_SIZE;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;

    // Scale factor from preview to output
    const s = OUTPUT_SIZE / CANVAS_SIZE;
    const dw = img.width * zoom * s;
    const dh = img.height * zoom * s;
    const dx = (OUTPUT_SIZE - dw) / 2 + offset.x * s;
    const dy = (OUTPUT_SIZE - dh) / 2 + offset.y * s;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);

    offscreen.toBlob(
      (blob) => { if (blob) onConfirm(blob); },
      "image/png",
      1,
    );
  };

  const minZoom = imgRef.current
    ? CANVAS_SIZE / Math.min(imgRef.current.width, imgRef.current.height)
    : 0.1;
  const maxZoom = imgRef.current
    ? (CANVAS_SIZE / Math.min(imgRef.current.width, imgRef.current.height)) * 3
    : 5;

  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/60">
      <div className="relative rounded-2xl bg-[#1e1e1e] border border-white/10 shadow-2xl p-6 w-[380px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">{ts("cropAvatarTitle")}</h3>
          <button onClick={onCancel} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="mx-auto rounded-xl cursor-grab active:cursor-grabbing"
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {/* Zoom slider */}
        <div className="flex items-center gap-3 mt-4 px-1">
          <span className="text-[11px] text-white/40 shrink-0">{ts("cropZoom")}</span>
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              const z = parseFloat(e.target.value);
              setZoom(z);
              setOffset((prev) => clampOffset(prev.x, prev.y, z));
            }}
            className="flex-1 h-1 accent-[#CCFF00] cursor-pointer"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onCancel}
            className="h-9 rounded-lg border border-white/10 bg-white/5 px-5 text-sm text-white/70 hover:bg-white/10 transition-colors"
          >
            {tc("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            className="h-9 rounded-lg bg-[#CCFF00] px-5 text-sm font-medium text-black hover:bg-[#CCFF00]/90 transition-colors"
          >
            {tc("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Verify Email Button with cooldown ── */
function VerifyEmailButton({ ts, showToast }: { ts: (k: string) => string; showToast: (msg: string, type?: string) => void }) {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSend = async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/verify-email/send", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCooldown(data.cooldownSeconds ?? 60);
        showToast(ts("emailVerifySent"));
      } else {
        const err = await res.json().catch(() => null);
        if (err?.error?.code === "VERIFY_COOLDOWN") {
          setCooldown(err.error.details?.retryAfterSeconds ?? 60);
          showToast(ts("emailVerifyCooldown"));
        } else {
          showToast(ts("emailVerifyFailed"));
        }
      }
    } catch { showToast(ts("emailVerifyFailed")); }
    setSending(false);
  };

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/10 px-3 py-2">
      <Mail size={12} className="text-amber-400 shrink-0" />
      <p className="text-[11px] text-amber-300/80 flex-1">
        {cooldown > 0 ? ts("emailVerifyCooldown") : ts("emailVerifyHint")}
      </p>
      <button
        onClick={handleSend}
        disabled={cooldown > 0 || sending}
        className={`text-[11px] font-medium whitespace-nowrap transition-colors ${
          cooldown > 0 || sending
            ? "text-amber-300/40 cursor-not-allowed"
            : "text-amber-300 hover:text-amber-200 cursor-pointer"
        }`}
      >
        {sending ? <Loader2 size={12} className="animate-spin" /> : cooldown > 0 ? `${cooldown}s` : ts("emailVerifyBtn")}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Profile Panel
   ══════════════════════════════════════════════════════════════ */

function ProfilePanel() {
  const t = useTranslations("profile");
  const ts = useTranslations("settings");
  const tc = useTranslations("common");
  const tm = useTranslations("membership");
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [referral, setReferral] = useState<{ count: number; max: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showReferralHistory, setShowReferralHistory] = useState(false);
  const [referralHistory, setReferralHistory] = useState<{ id: string; nickname: string; email: string; created_at: string; email_verified: boolean; rewarded: boolean; reward_amount: number }[] | null>(null);
  const [referralTotalEarned, setReferralTotalEarned] = useState(0);
  const [referralLoading, setReferralLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setNickname(data.user.nickname);
      setBio(data.user.bio ?? "");
      if (data.referral) setReferral(data.referral);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const handleCroppedUpload = async (blob: Blob) => {
    setCropFile(null);
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.png");
      const res = await fetch("/api/auth/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.avatar_url) {
        setUser((prev) => prev ? { ...prev, avatar_url: data.avatar_url } : prev);
        showToast(ts("avatarUpdated"));
      } else {
        showToast(data.error?.message ?? t("updateFailed"));
      }
    } catch {
      showToast(tc("networkError"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveNickname = async () => {
    if (!nickname.trim() || nickname === user?.nickname) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser((prev) => prev ? { ...prev, nickname: data.user.nickname } : prev);
        showToast(t("nicknameUpdated"));
      } else {
        showToast(data.error?.message ?? t("updateFailed"));
      }
    } catch {
      showToast(tc("networkError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBio = async () => {
    if (bio === (user?.bio ?? "")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bio.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser((prev) => prev ? { ...prev, bio: data.user.bio } : prev);
        showToast(ts("bioUpdated"));
      } else {
        showToast(data.error?.message ?? t("updateFailed"));
      }
    } catch {
      showToast(tc("networkError"));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { new_password: newPassword };
      if (currentPassword) body.current_password = currentPassword;
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentPassword("");
        setNewPassword("");
        showToast(t("passwordUpdated"));
      } else {
        showToast(data.error?.message ?? t("updateFailed"));
      }
    } catch {
      showToast(tc("networkError"));
    } finally {
      setSaving(false);
    }
  };

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    startTransition(() => { router.push(newPath); });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={20} className="animate-spin text-white/20" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="px-6 pb-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[300] flex items-center gap-2 rounded-xl bg-[#1a1a1a] border border-white/10 px-4 py-3 text-sm shadow-2xl animate-in fade-in slide-in-from-top-2">
          <Check size={14} className="text-[#CCFF00]" />
          {toast}
        </div>
      )}

      {/* Avatar Crop Modal */}
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCroppedUpload}
          onCancel={() => setCropFile(null)}
        />
      )}

      {/* Profile Card: Avatar + Username + Bio */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="text-sm font-medium text-white/50 mb-4">{ts("profileInfo")}</h3>
        <div className="flex gap-5">
          {/* Avatar with upload overlay */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative group size-16 rounded-full overflow-hidden border border-white/10 bg-white/[0.06] cursor-pointer"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.nickname} className="size-full object-cover" />
              ) : (
                <div className="size-full flex items-center justify-center text-white/30">
                  <User size={28} />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <Loader2 size={16} className="animate-spin text-white/70" />
                ) : (
                  <Camera size={16} className="text-white/70" />
                )}
              </div>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>

          {/* Username + Bio fields */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Username */}
            <div>
              <label className="text-xs text-white/40 mb-1 block">{ts("username")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={30}
                  className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white outline-none focus:border-white/20 transition-colors"
                />
                <button
                  onClick={handleSaveNickname}
                  disabled={saving || !nickname.trim() || nickname === user.nickname}
                  className="h-9 rounded-lg bg-[#CCFF00] px-4 text-sm font-medium text-black transition-colors hover:bg-[#CCFF00]/90 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {tc("save")}
                </button>
              </div>
              <div className="text-[10px] text-white/20 mt-1">{nickname.length}/30</div>
            </div>

            {/* Bio */}
            <div>
              <label className="text-xs text-white/40 mb-1 block">{ts("bioLabel")}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                maxLength={200}
                rows={3}
                placeholder={ts("bioPlaceholder")}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors resize-none"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-white/20">{bio.length}/200</span>
                <button
                  onClick={handleSaveBio}
                  disabled={saving || bio === (user.bio ?? "")}
                  className="text-xs text-[#CCFF00] hover:text-[#CCFF00]/80 disabled:opacity-30 transition-colors"
                >
                  {tc("save")}
                </button>
              </div>
            </div>

            {/* Email + verification status */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/30">{user.email}</span>
                {user.email_verified ? (
                  <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                    <CheckCircleIcon size={10} /> {ts("emailVerified")}
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                    <Mail size={10} /> {ts("emailUnverified")}
                  </span>
                )}
              </div>
              {!user.email_verified && (
                <VerifyEmailButton ts={ts} showToast={showToast} />
              )}
            </div>

            {/* Tier badge */}
            <span className="inline-flex items-center gap-1 rounded-full bg-[#CCFF00]/10 px-2 py-0.5 text-[10px] text-[#CCFF00] font-medium">
              <Crown size={10} /> {user.tier}
            </span>
          </div>
        </div>
      </div>

      {/* Referral */}
      {referral && user && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          {/* Header with history link */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/50 flex items-center gap-2">
              <Gift size={14} /> {ts("referralTitle")}
            </h3>
            <button
              onClick={async () => {
                setShowReferralHistory(!showReferralHistory);
                if (!referralHistory && !referralLoading) {
                  setReferralLoading(true);
                  try {
                    const res = await fetch("/api/auth/referrals");
                    if (res.ok) {
                      const data = await res.json();
                      setReferralHistory(data.referrals);
                      setReferralTotalEarned(data.summary.totalEarned);
                    }
                  } catch {}
                  setReferralLoading(false);
                }
              }}
              className="text-[11px] text-[#CCFF00]/70 hover:text-[#CCFF00] transition-colors underline underline-offset-2"
            >
              {showReferralHistory ? ts("referralHideHistory") : ts("referralViewHistory")}
            </button>
          </div>

          {!showReferralHistory ? (
            <>
              {/* Rules */}
              <div className="space-y-2 mb-4">
                <p className="text-xs text-white/40 leading-relaxed">
                  • {ts("referralRule1")}
                </p>
                <p className="text-xs text-white/40 leading-relaxed">
                  • {ts("referralRule2")}
                </p>
                <p className="text-xs text-white/40 leading-relaxed">
                  • {ts("referralRule3")}
                </p>
              </div>

              {/* Copy link */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${user.referral_code || user.id}`}
                  className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-xs text-white/60 outline-none select-all"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/register?ref=${user.referral_code || user.id}`);
                    setCopied(true);
                    showToast(ts("referralCopied"));
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="h-9 rounded-lg bg-[#CCFF00] px-3 text-sm font-medium text-black hover:bg-[#CCFF00]/90 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  {copied ? <CheckCircleIcon size={14} /> : <Copy size={14} />}
                  {copied ? ts("referralCopiedBtn") : ts("referralCopyBtn")}
                </button>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#CCFF00] transition-all"
                    style={{ width: `${Math.min(100, (referral.count / referral.max) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-white/40 tabular-nums shrink-0">
                  {referral.count}/{referral.max}
                </span>
              </div>

              {/* Social share */}
              <div className="pt-3 border-t border-white/[0.06]">
                <p className="text-[10px] text-white/25 mb-2">{ts("referralShareVia")}</p>
                <div className="flex gap-2">
                  {(() => {
                    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${user.referral_code || user.id}`;
                    const text = ts("referralShareText");
                    const socials = [
                      { name: "X", icon: <svg viewBox="0 0 24 24" className="size-3.5 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
                        url: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}` },
                      { name: "Facebook", icon: <svg viewBox="0 0 24 24" className="size-3.5 fill-current"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
                        url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(text)}` },
                      { name: "Reddit", icon: <svg viewBox="0 0 24 24" className="size-3.5 fill-current"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>,
                        url: `https://www.reddit.com/submit?url=${encodeURIComponent(link)}&title=${encodeURIComponent(text)}` },
                      { name: "LinkedIn", icon: <svg viewBox="0 0 24 24" className="size-3.5 fill-current"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
                        url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}` },
                      { name: "WhatsApp", icon: <svg viewBox="0 0 24 24" className="size-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
                        url: `https://wa.me/?text=${encodeURIComponent(text + " " + link)}` },
                    ];
                    return socials.map((s) => (
                      <a
                        key={s.name}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={s.name}
                        className="flex items-center justify-center size-8 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {s.icon}
                      </a>
                    ));
                  })()}
                </div>
              </div>
            </>
          ) : (
            /* Referral History */
            <div>
              {/* Summary */}
              <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="flex-1 text-center">
                  <p className="text-lg font-bold text-white">{referral.count}</p>
                  <p className="text-[10px] text-white/30">{ts("referralHistoryInvited")}</p>
                </div>
                <div className="w-px h-8 bg-white/[0.06]" />
                <div className="flex-1 text-center">
                  <p className="text-lg font-bold text-[#CCFF00]">+{referralTotalEarned}</p>
                  <p className="text-[10px] text-white/30">{ts("referralHistoryEarned")}</p>
                </div>
              </div>

              {/* List */}
              {referralLoading ? (
                <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-white/30" /></div>
              ) : !referralHistory || referralHistory.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-4">{ts("referralHistoryEmpty")}</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {referralHistory.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs text-white/70 truncate">{r.nickname}</p>
                        <p className="text-[10px] text-white/25">{r.email}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {r.rewarded ? (
                          <span className="text-xs text-[#CCFF00] font-medium">+{r.reward_amount}</span>
                        ) : (
                          <span className="text-[10px] text-white/20">{r.email_verified ? ts("referralHistoryPending") : ts("referralHistoryUnverified")}</span>
                        )}
                        <p className="text-[10px] text-white/20">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Language */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="text-sm font-medium text-white/50 mb-3 flex items-center gap-2">
          <Globe size={14} /> {ts("language")}
        </h3>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          <button
            onClick={() => switchLocale("zh")}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              locale === "zh"
                ? "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:bg-white/[0.05]"
            }`}
          >
            简体中文
          </button>
          <button
            onClick={() => switchLocale("en")}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              locale === "en"
                ? "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:bg-white/[0.05]"
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="text-sm font-medium text-white/50 mb-3 flex items-center gap-2">
          <Lock size={14} /> {t("changePassword")}
        </h3>
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showCurrentPw ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t("currentPasswordPlaceholder")}
              className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-3 pr-10 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPw(!showCurrentPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
            >
              {showCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showNewPw ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("newPasswordPlaceholder")}
              className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-3 pr-10 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowNewPw(!showNewPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
            >
              {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={saving || !newPassword}
            className="h-9 rounded-lg bg-white/10 border border-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t("updatePassword")}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-white/15 pb-2">
        {t("registeredAt", { date: new Date(user.created_at).toLocaleDateString("zh-CN") })}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Membership Panel (condensed)
   ══════════════════════════════════════════════════════════════ */

function MembershipPanel() {
  const t = useTranslations("membership");
  const tc = useTranslations("common");
  const lp = useLocalePath();
  const [data, setData] = useState<{ tier: string; subscription: any; balance: Balance | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const purchasesDisabled = process.env.NEXT_PUBLIC_DISABLE_PURCHASES === "true";

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/subscription");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubscribe = async (tier: string) => {
    setSubscribing(tier);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        setToast(result.error?.message ?? t("createSubscriptionFailed"));
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast(tc("networkError"));
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubscribing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={20} className="animate-spin text-white/20" />
      </div>
    );
  }

  const plans = [
    { code: "basic", apiTier: "BASIC", credits: 1500, monthly: 15, annually: 7.5 },
    { code: "pro", apiTier: "PRO", credits: 6000, monthly: 60, annually: 30, popular: true },
    { code: "ultimate", apiTier: "ULTIMATE", credits: 36000, monthly: 360, annually: 180 },
  ];

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-[300] flex items-center gap-2 rounded-xl bg-[#1a1a1a] border border-white/10 px-4 py-3 text-sm shadow-2xl">
          <Check size={14} className="text-[#CCFF00]" />
          {toast}
        </div>
      )}

      {/* Current plan info */}
      {data && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 mb-1">{t("currentPlan")}</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-white">
                  {data.tier}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#CCFF00]/10 px-2 py-0.5 text-[10px] text-[#CCFF00] font-medium">
                  <Crown size={10} />
                </span>
              </div>
            </div>
            {data.balance && (
              <div className="text-right">
                <div className="text-xs text-white/40 mb-1">余额</div>
                <div className="text-lg font-semibold text-[#CCFF00] tabular-nums">{data.balance.balance}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-3 gap-3">
        {plans.map((plan) => {
          const isCurrent = data?.tier === plan.apiTier;
          return (
            <div
              key={plan.code}
              className={`rounded-xl border p-4 transition-all ${
                plan.popular
                  ? "border-[#CCFF00]/20 bg-[#CCFF00]/[0.03]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-white">{t(plan.code)}</span>
                {plan.popular && (
                  <span className="rounded-full bg-[#CCFF00] px-1.5 py-0.5 text-[9px] font-bold text-black leading-none">HOT</span>
                )}
              </div>
              <div className="flex items-end gap-0.5 mb-1">
                <span className="text-xs text-white/50">$</span>
                <span className="text-2xl font-bold text-white tabular-nums leading-none">{plan.annually}</span>
                <span className="text-[10px] text-white/35 mb-0.5">/{t("perMonth")}</span>
              </div>
              <div className="text-[11px] text-white/30 mb-3">
                {plan.credits.toLocaleString()} {t("xinsUnit")}/{t("perMonth")}
              </div>
              {isCurrent ? (
                <button disabled className="w-full h-8 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-medium text-white/40">
                  {t("currentPlan")}
                </button>
              ) : purchasesDisabled ? (
                <button disabled className="w-full h-8 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-medium text-white/30">
                  {t("comingSoon")}
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan.apiTier)}
                  disabled={subscribing !== null}
                  className={`w-full h-8 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                    plan.popular
                      ? "border-[#CCFF00]/60 bg-[#CCFF00] text-black hover:bg-[#CCFF00]/90"
                      : "border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.10]"
                  }`}
                >
                  {subscribing === plan.apiTier && <Loader2 size={12} className="animate-spin" />}
                  {t("subscribe")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Full membership page link */}
      <div className="text-center">
        <button
          onClick={() => window.open(lp("/membership"), "_blank")}
          className="text-xs text-white/30 hover:text-white/55 transition-colors"
        >
          {t("viewBilling")}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Billing Panel (sub-tabs: 账单 + 交易记录)
   ══════════════════════════════════════════════════════════════ */

type BillingSubTab = "bills" | "transactions";

function BillingPanel() {
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const ts = useTranslations("settings");
  const [subTab, setSubTab] = useState<BillingSubTab>("transactions");

  // ── Invoices state ──
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesFetched, setInvoicesFetched] = useState(false);

  // ── Ledger state ──
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const DESC_PREFIX_KEYS: Record<string, string> = {
    "Image generation": "descImageGeneration",
    "Image inpaint": "descImageInpaint",
    "Image erase": "descImageErase",
    "Video generation": "descVideoGeneration",
    "Video edit": "descVideoEdit",
    "Text generation": "descTextGeneration",
    "Topaz enhance": "descTopazEnhance",
    "Topaz video enhance": "descTopazVideoEnhance",
    "Remove BG": "descRemoveBg",
    "Outpaint": "descOutpaint",
  };

  function localizeDesc(desc: string | null): string {
    if (!desc) return "—";
    let result = desc;
    for (const [prefix, key] of Object.entries(DESC_PREFIX_KEYS)) {
      if (result.startsWith(prefix)) {
        result = t(key) + result.slice(prefix.length);
        break;
      }
    }
    return result;
  }

  const fetchRecords = useCallback(async () => {
    setLedgerLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    const res = await fetch(`/api/billing/ledger?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRecords(data.records);
      setTotalPages(data.pagination.totalPages);
    }
    setLedgerLoading(false);
  }, [page]);

  const fetchInvoices = useCallback(async () => {
    if (invoicesFetched) return;
    setInvoicesLoading(true);
    try {
      const res = await fetch("/api/billing/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices ?? []);
      }
    } catch { /* ignore */ } finally {
      setInvoicesLoading(false);
      setInvoicesFetched(true);
    }
  }, [invoicesFetched]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { if (subTab === "bills") fetchInvoices(); }, [subTab, fetchInvoices]);

  // Pagination helpers
  const maxVisiblePages = 5;
  const getPageNumbers = () => {
    if (totalPages <= maxVisiblePages) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const half = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, page - half);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);
    if (end - start + 1 < maxVisiblePages) start = Math.max(1, end - maxVisiblePages + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  return (
    <div className="px-6 pb-6 flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="grid grid-cols-2 w-full max-w-sm mb-4 rounded-lg bg-white/[0.04] p-1">
        <button
          onClick={() => setSubTab("bills")}
          className={`flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            subTab === "bills"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <FileText size={14} /> {ts("tabBills")}
        </button>
        <button
          onClick={() => setSubTab("transactions")}
          className={`flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            subTab === "transactions"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <Receipt size={14} /> {ts("tabTransactions")}
        </button>
      </div>

      {/* ── Bills (Invoices) sub-tab ── */}
      {subTab === "bills" && (
        invoicesLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-white/20" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-white/25">
            <FileText size={28} className="mb-2 opacity-60" />
            <p className="text-xs">{t("noInvoices")}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colInvoiceNo")}</th>
                  <th className="text-left text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colDate")}</th>
                  <th className="text-left text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colDescription")}</th>
                  <th className="text-right text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colAmount")}</th>
                  <th className="text-center text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-white/70 font-mono">{inv.number || inv.id.slice(0, 12)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-white/40 tabular-nums">
                        {new Date(inv.created * 1000).toLocaleDateString("zh-CN")}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-white/40 max-w-[200px] truncate">{inv.description}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="text-xs font-semibold text-green-400 tabular-nums">
                        ${(inv.amount_paid / 100).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {inv.hosted_invoice_url && (
                          <a
                            href={inv.hosted_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center size-7 rounded-md text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors"
                            title={t("viewInvoice")}
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        {inv.invoice_pdf && (
                          <a
                            href={inv.invoice_pdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center size-7 rounded-md text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors"
                            title={t("downloadPdf")}
                          >
                            <Download size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Transactions (Ledger) sub-tab ── */}
      {subTab === "transactions" && (
        ledgerLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-white/20" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-white/25">
            <Coins size={28} className="mb-2 opacity-60" />
            <p className="text-xs">{t("noRecords")}</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-white/[0.06] overflow-hidden flex-1 min-h-0">
              <div className="overflow-auto h-full">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#161616]">
                      <th className="text-left text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colTxId")}</th>
                      <th className="text-left text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colTime")}</th>
                      <th className="text-left text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colType")}</th>
                      <th className="text-left text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colDescription")}</th>
                      <th className="text-right text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colAmount")}</th>
                      <th className="text-center text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colStatus")}</th>
                      <th className="text-right text-[11px] font-medium text-white/30 uppercase tracking-wider px-4 py-2.5">{ts("colBalance")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="text-xs text-white/60 font-mono truncate max-w-[140px]" title={r.id}>{r.id}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs text-white/40 tabular-nums whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString("zh-CN", {
                              year: "numeric", month: "numeric", day: "numeric",
                              hour: "2-digit", minute: "2-digit", second: "2-digit",
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className={`text-xs font-medium whitespace-nowrap ${TYPE_COLORS[r.type] ?? "text-white/70"}`}>
                            {TYPE_KEYS[r.type] ? t(TYPE_KEYS[r.type]) : r.type}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs text-white/40 max-w-[180px] truncate" title={r.description ?? ""}>
                            {localizeDesc(r.description)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className={`text-xs font-semibold tabular-nums ${r.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                            {r.amount > 0 ? "+" : ""}{Math.abs(r.amount).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400">
                            {ts("statusCompleted")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="text-xs font-medium text-white/70 tabular-nums">
                            {r.balance_after.toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] mt-4">
                <div className="text-xs text-white/40">
                  {ts("pageInfo", { page: String(page), total: String(totalPages) })}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="flex items-center justify-center size-7 rounded-md border border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`min-w-[28px] h-7 rounded-md px-2 text-xs font-medium transition-colors ${
                          p === page
                            ? "bg-white/15 text-white"
                            : "border border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.08]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="flex items-center justify-center size-7 rounded-md border border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Notifications Panel
   ══════════════════════════════════════════════════════════════ */

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  type: "INFO" | "WARNING" | "MAINTENANCE";
  is_pinned: boolean;
  created_at: string;
}

interface SocialNotification {
  id: string;
  type: "FOLLOW" | "LIKE" | "CLONE" | "SYSTEM";
  share_id: string | null;
  content: string | null;
  is_read: boolean;
  created_at: string;
  sender: {
    id: string;
    nickname: string;
    avatar_url: string | null;
  } | null;
}

const NOTIF_TYPE_CONFIG: Record<string, { icon: typeof Info; bg: string; border: string; text: string }> = {
  INFO: { icon: Info, bg: "bg-blue-500/[0.06]", border: "border-blue-500/15", text: "text-blue-400" },
  WARNING: { icon: AlertTriangle, bg: "bg-yellow-500/[0.06]", border: "border-yellow-500/15", text: "text-yellow-400" },
  MAINTENANCE: { icon: Wrench, bg: "bg-orange-500/[0.06]", border: "border-orange-500/15", text: "text-orange-400" },
};

function NotificationsPanel({ onUnreadCountChange }: { onUnreadCountChange?: (count: number) => void }) {
  const ts = useTranslations("settings");
  const tn = useTranslations("notifications");
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [socials, setSocials] = useState<SocialNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/announcements").then((r) => r.json()).then((d) => d.items ?? []).catch(() => []),
      fetch("/api/notifications?limit=30").then((r) => r.json()).then((d) => d.notifications ?? []).catch(() => []),
    ]).then(([ann, soc]) => {
      setAnnouncements(ann);
      setSocials(soc);
    }).finally(() => setLoading(false));
  }, []);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
      setSocials((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onUnreadCountChange?.(0);
    } catch {}
  };

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return tn("justNow");
    if (diffMin < 60) return tn("minutesAgo", { count: diffMin });
    if (diffHr < 24) return tn("hoursAgo", { count: diffHr });
    if (diffDay < 7) return tn("daysAgo", { count: diffDay });
    return d.toLocaleDateString();
  }

  function getSocialMessage(n: SocialNotification) {
    const sender = n.sender?.nickname ?? tn("someone");
    switch (n.type) {
      case "FOLLOW": return tn("followedYou", { user: sender });
      case "LIKE": return tn("likedYourWork", { user: sender });
      case "CLONE": return tn("clonedYourWork", { user: sender });
      case "SYSTEM": return n.content ?? tn("systemMessage");
      default: return n.content ?? "";
    }
  }

  function getSocialIcon(type: string) {
    switch (type) {
      case "FOLLOW": return <Info size={16} className="text-blue-400" />;
      case "LIKE": return <Info size={16} className="text-pink-400" />;
      case "CLONE": return <Info size={16} className="text-green-400" />;
      default: return <Bell size={16} className="text-white/40" />;
    }
  }

  const hasContent = announcements.length > 0 || socials.length > 0;
  const unreadCount = socials.filter((n) => !n.is_read).length;

  return (
    <div className="px-8 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{ts("notifications")}</h2>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-[#CCFF00] hover:text-[#CCFF00]/80 transition-colors cursor-pointer"
          >
            {tn("markAllRead")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-white/30" />
        </div>
      ) : !hasContent ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex items-center justify-center size-12 rounded-full bg-white/[0.04] mb-3">
            <Bell size={20} className="text-white/20" />
          </div>
          <div className="text-sm text-white/40">{ts("noNotifications")}</div>
          <div className="text-xs text-white/20 mt-1">{ts("noNotificationsDesc")}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* System Announcements */}
          {announcements.length > 0 && (
            <div className="space-y-2">
              {announcements.map((item) => {
                const cfg = NOTIF_TYPE_CONFIG[item.type] ?? NOTIF_TYPE_CONFIG.INFO;
                const Icon = cfg.icon;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex items-center justify-center size-8 rounded-lg bg-white/[0.04] shrink-0 mt-0.5`}>
                        <Icon size={16} className={cfg.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white">{item.title}</span>
                          {item.is_pinned && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
                              <Pin size={8} /> {ts("pinned")}
                            </span>
                          )}
                          <span className="ml-auto text-[11px] text-white/25 tabular-nums shrink-0">
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-white/50 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Social Notifications */}
          {socials.length > 0 && (
            <div className="space-y-1">
              {socials.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 rounded-xl p-3 transition-colors ${
                    !n.is_read ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {n.sender?.avatar_url ? (
                      <img src={n.sender.avatar_url} className="size-8 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="size-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 text-xs">
                        {n.sender?.nickname?.charAt(0) ?? "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getSocialIcon(n.type)}
                      <span className="text-sm text-white/70">{getSocialMessage(n)}</span>
                    </div>
                    <span className="text-[11px] text-white/30 mt-0.5 block">{formatDate(n.created_at)}</span>
                  </div>
                  {!n.is_read && (
                    <div className="shrink-0 mt-2">
                      <div className="size-2 rounded-full bg-[#CCFF00]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
