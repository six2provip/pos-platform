"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Unlock,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { BeInput } from "@/components/motion/input";
import { BeSelect } from "@/components/motion/select";
import { BeSwitch } from "@/components/motion/switch";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { DotPattern } from "@/components/ui/dot-pattern";

interface PlatformAdminInfo {
  id: string;
  email: string;
  display_name: string;
  role: "super_admin" | "support";
  status: "active" | "locked";
  last_login_at?: string | null;
  created_at?: string | null;
}

interface PlatformOrgRow {
  id: string;
  code: string;
  name: string;
  status: "active" | "pending_approval" | "suspended" | "archived";
  default_currency: string;
  timezone: string;
  max_stores_limit: number;
  max_devices_limit: number;
  store_count: number;
  user_count: number;
  device_count: number;
  owner_id?: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  created_at?: string | null;
}

interface OrgUserRow {
  id: string;
  email: string;
  phone?: string | null;
  display_name: string;
  status: "active" | "locked";
  roles: string[];
  active_sessions: number;
  last_login_at?: string | null;
  created_at?: string | null;
}

const TOKEN_KEY = "pos_platform_admin_token";

export default function ProviderPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<PlatformAdminInfo | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Login form
  const [loginEmail, setLoginEmail] = useState("superadmin@pos.vn");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Main data
  const [activeTab, setActiveTab] = useState<"orgs" | "admins">("orgs");
  const [orgs, setOrgs] = useState<PlatformOrgRow[]>([]);
  const [admins, setAdmins] = useState<PlatformAdminInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Filters
  const [orgSearch, setOrgSearch] = useState("");
  const [orgStatusFilter, setOrgStatusFilter] = useState<string>("all");

  // Modals
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [newOrgCode, setNewOrgCode] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgEmail, setNewOrgEmail] = useState("");
  const [newOrgPassword, setNewOrgPassword] = useState("Owner@123456");
  const [newOrgOwnerName, setNewOrgOwnerName] = useState("Chủ Doanh Nghiệp");
  const [newOrgStoreCode, setNewOrgStoreCode] = useState("");
  const [newOrgStoreName, setNewOrgStoreName] = useState("Chi nhánh Chính");
  const [newOrgMaxStores, setNewOrgMaxStores] = useState("10");
  const [newOrgMaxDevices, setNewOrgMaxDevices] = useState("50");

  const [limitsOrg, setLimitsOrg] = useState<PlatformOrgRow | null>(null);
  const [editMaxStores, setEditMaxStores] = useState("10");
  const [editMaxDevices, setEditMaxDevices] = useState("50");

  // Org Users drawer/modal
  const [usersModalOrg, setUsersModalOrg] = useState<PlatformOrgRow | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrgUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<{
    org: PlatformOrgRow;
    user: OrgUserRow;
  } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("NewPass@123");
  const [resetRevokeSessions, setResetRevokeSessions] = useState(true);

  // Create platform admin modal
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<"support" | "super_admin">("support");

  const notify = useCallback(
    (type: "success" | "error" | "info", text: string) => {
      setBanner({ type, text });
    },
    []
  );

  const apiCall = useCallback(
    async (
      path: string,
      options: RequestInit = {},
      tokenOverride?: string | null
    ) => {
      const tk = tokenOverride !== undefined ? tokenOverride : token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...((options.headers as Record<string, string>) || {}),
      };
      if (tk) {
        headers["Authorization"] = `Bearer ${tk}`;
      }
      const res = await fetch(path, { ...options, headers });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        throw new Error(
          json?.message || json?.error?.code || `HTTP ${res.status} error`
        );
      }
      return json?.data;
    },
    [token]
  );

  const loadDashboardData = useCallback(
    async (tk: string) => {
      setLoading(true);
      try {
        const me: PlatformAdminInfo = await apiCall(
          "/api/v1/platform/auth/me",
          {},
          tk
        );
        setAdminInfo(me);
        const orgList = await apiCall(
          "/api/v1/platform/organizations",
          {},
          tk
        );
        setOrgs(Array.isArray(orgList) ? orgList : []);

        if (me.role === "super_admin") {
          const adminList = await apiCall("/api/v1/platform/admins", {}, tk);
          setAdmins(Array.isArray(adminList) ? adminList : []);
        }
      } catch (err: any) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setAdminInfo(null);
        notify("error", err?.message || "Phiên đăng nhập đã hết hạn.");
      } finally {
        setLoading(false);
      }
    },
    [apiCall, notify]
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      loadDashboardData(saved).finally(() => setInitializing(false));
    } else {
      setInitializing(false);
    }
  }, [loadDashboardData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setBanner(null);
    try {
      const data = await apiCall(
        "/api/v1/platform/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: loginEmail.trim(),
            password: loginPassword,
          }),
        },
        null
      );
      const tk = data.access_token;
      sessionStorage.setItem(TOKEN_KEY, tk);
      setToken(tk);
      setAdminInfo(data.admin);
      await loadDashboardData(tk);
    } catch (err: any) {
      notify("error", err?.message || "Đăng nhập thất bại.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAdminInfo(null);
    setOrgs([]);
    setAdmins([]);
  };

  const handleOrgStatus = async (
    org: PlatformOrgRow,
    nextStatus: "active" | "suspended"
  ) => {
    if (!token) return;
    try {
      await apiCall(`/api/v1/platform/organizations/${org.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      notify(
        "success",
        nextStatus === "active"
          ? `Đã kích hoạt tổ chức "${org.name}".`
          : `Đã tạm khóa tổ chức "${org.name}".`
      );
      await loadDashboardData(token);
    } catch (err: any) {
      notify("error", err?.message || "Không thể cập nhật trạng thái.");
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await apiCall("/api/v1/platform/organizations", {
        method: "POST",
        body: JSON.stringify({
          code: newOrgCode.trim().toUpperCase(),
          name: newOrgName.trim(),
          admin_email: newOrgEmail.trim(),
          admin_password: newOrgPassword,
          admin_display_name: newOrgOwnerName.trim(),
          initial_store_code: newOrgStoreCode.trim()
            ? newOrgStoreCode.trim().toUpperCase()
            : undefined,
          initial_store_name: newOrgStoreName.trim() || undefined,
          max_stores_limit: Number(newOrgMaxStores) || 10,
          max_devices_limit: Number(newOrgMaxDevices) || 50,
          status: "active",
        }),
      });
      setCreateOrgOpen(false);
      setNewOrgCode("");
      setNewOrgName("");
      setNewOrgEmail("");
      setNewOrgStoreCode("");
      notify("success", `Đã khởi tạo tổ chức "${newOrgName}" thành công!`);
      await loadDashboardData(token);
    } catch (err: any) {
      notify("error", err?.message || "Không thể tạo tổ chức mới.");
    }
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !limitsOrg) return;
    try {
      await apiCall(`/api/v1/platform/organizations/${limitsOrg.id}/limits`, {
        method: "PATCH",
        body: JSON.stringify({
          max_stores_limit: Number(editMaxStores) || 10,
          max_devices_limit: Number(editMaxDevices) || 50,
        }),
      });
      notify("success", `Đã cập nhật hạn mức cho "${limitsOrg.name}".`);
      setLimitsOrg(null);
      await loadDashboardData(token);
    } catch (err: any) {
      notify("error", err?.message || "Không thể cập nhật hạn mức.");
    }
  };

  const openUsersModal = async (org: PlatformOrgRow) => {
    if (!token) return;
    setUsersModalOrg(org);
    setLoadingUsers(true);
    try {
      const list = await apiCall(
        `/api/v1/platform/organizations/${org.id}/users`
      );
      setOrgUsers(Array.isArray(list) ? list : []);
    } catch (err: any) {
      notify("error", err?.message || "Không thể tải danh sách tài khoản.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      const res = await apiCall(
        `/api/v1/platform/organizations/${resetTarget.org.id}/users/${resetTarget.user.id}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({
            new_password: resetNewPassword,
            revoke_sessions: resetRevokeSessions,
          }),
        }
      );
      notify(
        "success",
        `Đã đặt lại mật khẩu cho "${resetTarget.user.email}" (đã thu hồi ${res?.revoked_sessions ?? 0} phiên).`
      );
      setResetTarget(null);
      await openUsersModal(resetTarget.org);
    } catch (err: any) {
      notify("error", err?.message || "Không thể đặt lại mật khẩu.");
    }
  };

  const handleToggleUserStatus = async (
    org: PlatformOrgRow,
    user: OrgUserRow
  ) => {
    const nextStatus = user.status === "active" ? "locked" : "active";
    try {
      await apiCall(
        `/api/v1/platform/organizations/${org.id}/users/${user.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      notify(
        "success",
        nextStatus === "locked"
          ? `Đã khóa tài khoản "${user.email}".`
          : `Đã mở khóa tài khoản "${user.email}".`
      );
      await openUsersModal(org);
    } catch (err: any) {
      notify("error", err?.message || "Không thể cập nhật trạng thái user.");
    }
  };

  const handleRevokeSessions = async (
    org: PlatformOrgRow,
    user: OrgUserRow
  ) => {
    try {
      const res = await apiCall(
        `/api/v1/platform/organizations/${org.id}/users/${user.id}/revoke-sessions`,
        { method: "POST" }
      );
      notify(
        "success",
        `Đã đăng xuất ${res?.revoked_sessions ?? 0} phiên của "${user.email}".`
      );
      await openUsersModal(org);
    } catch (err: any) {
      notify("error", err?.message || "Không thể thu hồi phiên.");
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await apiCall("/api/v1/platform/admins", {
        method: "POST",
        body: JSON.stringify({
          email: newAdminEmail.trim(),
          display_name: newAdminName.trim(),
          password: newAdminPassword,
          role: newAdminRole,
        }),
      });
      setCreateAdminOpen(false);
      setNewAdminEmail("");
      setNewAdminName("");
      setNewAdminPassword("");
      notify("success", `Đã thêm quản trị viên "${newAdminEmail}".`);
      await loadDashboardData(token);
    } catch (err: any) {
      notify("error", err?.message || "Không thể tạo tài khoản admin.");
    }
  };

  const handleToggleAdminStatus = async (adm: PlatformAdminInfo) => {
    if (!token) return;
    const nextStatus = adm.status === "active" ? "locked" : "active";
    try {
      await apiCall(`/api/v1/platform/admins/${adm.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      notify(
        "success",
        nextStatus === "locked"
          ? `Đã khóa tài khoản "${adm.email}".`
          : `Đã mở khóa tài khoản "${adm.email}".`
      );
      await loadDashboardData(token);
    } catch (err: any) {
      notify("error", err?.message || "Không thể cập nhật tài khoản admin.");
    }
  };

  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    return orgs.filter((o) => {
      if (orgStatusFilter !== "all" && o.status !== orgStatusFilter) return false;
      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        (o.owner_email || "").toLowerCase().includes(q)
      );
    });
  }, [orgs, orgSearch, orgStatusFilter]);

  const stats = useMemo(
    () => ({
      total: orgs.length,
      active: orgs.filter((o) => o.status === "active").length,
      pending: orgs.filter((o) => o.status === "pending_approval").length,
      suspended: orgs.filter((o) => o.status === "suspended").length,
    }),
    [orgs]
  );

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-950">
        Đang kiểm tra phiên Super Admin...
      </div>
    );
  }

  // LOGIN VIEW
  if (!token || !adminInfo) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#F8F9FA] px-4 py-12 text-neutral-900 dark:bg-neutral-950 dark:text-white">
        <DotPattern className="opacity-55 [mask-image:radial-gradient(520px_circle_at_center,white,transparent)]" />

        <BlurFade delay={0.04} className="relative z-10 w-full max-w-[420px]">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-2 inline-flex items-center gap-1.5 text-xl font-bold tracking-tight">
              <span>POS.com</span>
              <span className="rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white dark:bg-white dark:text-neutral-900">
                Provider Portal
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Super Admin Console
            </h1>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Cổng quản trị nội bộ dành riêng cho nhà cung cấp nền tảng
            </p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-neutral-200/80 bg-white p-7 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <BorderBeam
              size={110}
              duration={8}
              colorFrom="#111827"
              colorTo="#9ca3af"
            />

            {banner && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{banner.text}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <BeInput
                label="Email Super Admin"
                type="email"
                value={loginEmail}
                onChange={setLoginEmail}
                placeholder="superadmin@pos.vn"
              />
              <BeInput
                label="Mật khẩu"
                type="password"
                value={loginPassword}
                onChange={setLoginPassword}
                placeholder="••••••••••••"
              />
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-full bg-neutral-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                {loginLoading ? "Đang xác thực..." : "Đăng nhập Super Admin"}
              </button>
            </form>
          </div>
        </BlurFade>
      </div>
    );
  }

  // CONSOLE VIEW
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/85 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight">
                  Provider Super-Admin
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                  {adminInfo.role === "super_admin" ? "Super Admin" : "Support"}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {adminInfo.display_name} • {adminInfo.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadDashboardData(token)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-rose-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        {banner && (
          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-medium ${
              banner.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="rounded-lg p-1 hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-neutral-200/80 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setActiveTab("orgs")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                activeTab === "orgs"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Tổ chức & Tài khoản Khách ({orgs.length})
            </button>
            {adminInfo.role === "super_admin" && (
              <button
                type="button"
                onClick={() => setActiveTab("admins")}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === "admins"
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                Quản trị viên Nội bộ ({admins.length})
              </button>
            )}
          </div>

          {activeTab === "orgs" && adminInfo.role === "super_admin" && (
            <button
              type="button"
              onClick={() => setCreateOrgOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo Tổ Chức Mới
            </button>
          )}
          {activeTab === "admins" && adminInfo.role === "super_admin" && (
            <button
              type="button"
              onClick={() => setCreateAdminOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm Admin Nội Bộ
            </button>
          )}
        </div>

        {/* TAB 1: ORGANIZATIONS */}
        {activeTab === "orgs" && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-[11px] font-medium text-neutral-500">Tổng tổ chức</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{stats.total}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Đang hoạt động</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{stats.active}</div>
              </div>
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/40 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Chờ duyệt</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{stats.pending}</div>
              </div>
              <div className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                <div className="text-[11px] font-medium text-rose-700 dark:text-rose-300">Đang khóa</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-300">{stats.suspended}</div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3 sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
                <Search className="h-3.5 w-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  placeholder="Tìm theo tên, mã tổ chức hoặc email Owner..."
                  className="w-full bg-transparent text-xs focus:outline-none"
                />
              </div>
              <div className="w-full sm:w-52">
                <BeSelect
                  value={orgStatusFilter}
                  onValueChange={setOrgStatusFilter}
                  options={[
                    { value: "all", label: "Tất cả trạng thái" },
                    { value: "active", label: "Đang hoạt động" },
                    { value: "pending_approval", label: "Chờ duyệt" },
                    { value: "suspended", label: "Đang khóa" },
                  ]}
                />
              </div>
            </div>

            {/* Organizations Table */}
            <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                      <th className="px-4 py-3">Tổ chức</th>
                      <th className="px-4 py-3">Owner (Chủ sở hữu)</th>
                      <th className="px-4 py-3 text-center">Chi nhánh / POS / User</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filteredOrgs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                          Không có tổ chức nào phù hợp.
                        </td>
                      </tr>
                    ) : (
                      filteredOrgs.map((o) => (
                        <tr key={o.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40">
                          <td className="px-4 py-3">
                            <div className="font-bold text-neutral-900 dark:text-white">{o.name}</div>
                            <div className="text-[11px] font-mono text-neutral-500">{o.code}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                              {o.owner_name || "--"}
                            </div>
                            <div className="text-[11px] text-neutral-500">{o.owner_email || "--"}</div>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            <div className="inline-flex items-center gap-2 text-[11px]">
                              <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-semibold dark:bg-neutral-800">
                                {o.store_count}/{o.max_stores_limit} CN
                              </span>
                              <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-semibold dark:bg-neutral-800">
                                {o.device_count}/{o.max_devices_limit} POS
                              </span>
                              <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-semibold dark:bg-neutral-800">
                                {o.user_count} Users
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                o.status === "active"
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  : o.status === "pending_approval"
                                    ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                                    : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                              }`}
                            >
                              {o.status === "active"
                                ? "Đang hoạt động"
                                : o.status === "pending_approval"
                                  ? "Chờ duyệt"
                                  : "Đang khóa"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openUsersModal(o)}
                                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                              >
                                <Users className="h-3 w-3" />
                                Tài khoản
                              </button>
                              {adminInfo.role === "super_admin" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLimitsOrg(o);
                                      setEditMaxStores(String(o.max_stores_limit));
                                      setEditMaxDevices(String(o.max_devices_limit));
                                    }}
                                    className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                                  >
                                    <Sliders className="h-3 w-3" />
                                    Hạn mức
                                  </button>
                                  {o.status !== "active" ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOrgStatus(o, "active")}
                                      className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                                    >
                                      <Unlock className="h-3 w-3" />
                                      {o.status === "pending_approval" ? "Duyệt" : "Mở khóa"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOrgStatus(o, "suspended")}
                                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
                                    >
                                      <Lock className="h-3 w-3" />
                                      Khóa
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PLATFORM ADMINS */}
        {activeTab === "admins" && adminInfo.role === "super_admin" && (
          <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                    <th className="px-4 py-3">Quản trị viên</th>
                    <th className="px-4 py-3">Vai trò</th>
                    <th className="px-4 py-3">Đăng nhập gần nhất</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {admins.map((adm) => (
                    <tr key={adm.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40">
                      <td className="px-4 py-3">
                        <div className="font-bold">{adm.display_name}</div>
                        <div className="text-[11px] text-neutral-500">{adm.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold dark:bg-neutral-800">
                          {adm.role === "super_admin" ? "Super Admin (Toàn quyền)" : "Support (Hỗ trợ)"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {adm.last_login_at
                          ? new Date(adm.last_login_at).toLocaleString("vi-VN")
                          : "Chưa đăng nhập"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            adm.status === "active"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                          }`}
                        >
                          {adm.status === "active" ? "Hoạt động" : "Đã khóa"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {adm.id !== adminInfo.id && (
                          <button
                            type="button"
                            onClick={() => handleToggleAdminStatus(adm)}
                            className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                          >
                            {adm.status === "active" ? "Khóa tài khoản" : "Mở khóa"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: CREATE ORGANIZATION */}
      <AnimatePresence>
        {createOrgOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateOrgOpen(false)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.form
                onSubmit={handleCreateOrg}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                className="pointer-events-auto flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold">Tạo Tổ Chức & Tài Khoản Owner</h3>
                    <p className="text-[11px] text-neutral-400">Khởi tạo nhanh doanh nghiệp mới cùng chi nhánh đầu tiên.</p>
                  </div>
                  <button type="button" onClick={() => setCreateOrgOpen(false)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3.5 overflow-y-auto p-6">
                  <div className="grid grid-cols-2 gap-3">
                    <BeInput label="Mã tổ chức *" value={newOrgCode} onChange={setNewOrgCode} placeholder="VD: COFFEE-VN" />
                    <BeInput label="Tên tổ chức *" value={newOrgName} onChange={setNewOrgName} placeholder="VD: The Coffee VN" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BeInput label="Email Owner *" type="email" value={newOrgEmail} onChange={setNewOrgEmail} placeholder="owner@company.vn" />
                    <BeInput label="Tên Owner *" value={newOrgOwnerName} onChange={setNewOrgOwnerName} />
                  </div>
                  <BeInput label="Mật khẩu Owner *" type="password" value={newOrgPassword} onChange={setNewOrgPassword} />
                  <div className="grid grid-cols-2 gap-3">
                    <BeInput label="Mã chi nhánh đầu" value={newOrgStoreCode} onChange={setNewOrgStoreCode} placeholder="VD: CN-01" />
                    <BeInput label="Tên chi nhánh đầu" value={newOrgStoreName} onChange={setNewOrgStoreName} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BeInput label="Giới hạn chi nhánh" type="number" value={newOrgMaxStores} onChange={setNewOrgMaxStores} />
                    <BeInput label="Giới hạn máy POS" type="number" value={newOrgMaxDevices} onChange={setNewOrgMaxDevices} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button type="button" onClick={() => setCreateOrgOpen(false)} className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold dark:border-neutral-700">
                    Hủy
                  </button>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
                    <Check className="h-3.5 w-3.5" />
                    Tạo Tổ Chức
                  </button>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: EDIT ORG LIMITS */}
      <AnimatePresence>
        {limitsOrg && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLimitsOrg(null)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.form
                onSubmit={handleSaveLimits}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold">Hạn mức: {limitsOrg.name}</h3>
                    <p className="text-[11px] text-neutral-400">Giới hạn số chi nhánh và thiết bị POS được phép tạo.</p>
                  </div>
                  <button type="button" onClick={() => setLimitsOrg(null)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-6">
                  <BeInput label="Tối đa chi nhánh" type="number" value={editMaxStores} onChange={setEditMaxStores} />
                  <BeInput label="Tối đa máy POS" type="number" value={editMaxDevices} onChange={setEditMaxDevices} />
                </div>
                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button type="button" onClick={() => setLimitsOrg(null)} className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold dark:border-neutral-700">
                    Hủy
                  </button>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
                    <Check className="h-3.5 w-3.5" />
                    Lưu Hạn Mức
                  </button>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: ORG USERS ACCOUNT MANAGEMENT */}
      <AnimatePresence>
        {usersModalOrg && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setUsersModalOrg(null)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                className="pointer-events-auto flex max-h-[84vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold">
                      Tài khoản thuộc tổ chức: {usersModalOrg.name} ({usersModalOrg.code})
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Quản lý Owner, Quản lý và Nhân viên — hỗ trợ đặt lại mật khẩu, khóa tài khoản & đăng xuất khẩn cấp.
                    </p>
                  </div>
                  <button type="button" onClick={() => setUsersModalOrg(null)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {loadingUsers ? (
                    <div className="py-10 text-center text-xs text-neutral-500">Đang tải danh sách tài khoản...</div>
                  ) : orgUsers.length === 0 ? (
                    <div className="py-10 text-center text-xs text-neutral-500">Chưa có tài khoản nào.</div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200/80 text-[11px] font-semibold uppercase text-neutral-500 dark:border-neutral-800">
                          <th className="py-2.5 pr-3">Tài khoản</th>
                          <th className="py-2.5 px-3">Vai trò</th>
                          <th className="py-2.5 px-3 text-center">Phiên đang mở</th>
                          <th className="py-2.5 px-3">Trạng thái</th>
                          <th className="py-2.5 pl-3 text-right">Hỗ trợ & Bảo mật</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {orgUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="py-3 pr-3">
                              <div className="font-bold">{u.display_name}</div>
                              <div className="text-[11px] text-neutral-500">{u.email}</div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1">
                                {u.roles.map((r) => (
                                  <span key={r} className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-neutral-800">
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center tabular-nums font-semibold">
                              {u.active_sessions}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                  u.status === "active"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                                    : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
                                }`}
                              >
                                {u.status === "active" ? "Hoạt động" : "Đã khóa"}
                              </span>
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetTarget({ org: usersModalOrg, user: u });
                                    setResetNewPassword("NewPass@123");
                                    setResetRevokeSessions(true);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                                >
                                  <KeyRound className="h-3 w-3" />
                                  Đặt lại MK
                                </button>
                                {u.active_sessions > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeSessions(usersModalOrg, u)}
                                    className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-amber-600 hover:bg-amber-50 dark:border-neutral-700"
                                  >
                                    Đăng xuất
                                  </button>
                                )}
                                {adminInfo.role === "super_admin" && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(usersModalOrg, u)}
                                    className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-neutral-700"
                                  >
                                    {u.status === "active" ? "Khóa" : "Mở"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: RESET USER PASSWORD */}
      <AnimatePresence>
        {resetTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setResetTarget(null)}
              className="fixed inset-0 z-[90] bg-black/35 [backdrop-filter:blur(8px)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[91] flex items-center justify-center">
              <motion.form
                onSubmit={handleResetPassword}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold">Đặt lại mật khẩu tài khoản</h3>
                    <p className="text-[11px] text-neutral-400">{resetTarget.user.email}</p>
                  </div>
                  <button type="button" onClick={() => setResetTarget(null)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-4 p-6">
                  <BeInput
                    label="Mật khẩu mới (tối thiểu 8 ký tự) *"
                    type="text"
                    value={resetNewPassword}
                    onChange={setResetNewPassword}
                  />
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3.5 py-2.5 dark:bg-neutral-900">
                    <div>
                      <div className="text-xs font-semibold">Đăng xuất mọi thiết bị đang login</div>
                      <div className="text-[11px] text-neutral-400">Khuyên dùng khi tài khoản bị lộ hoặc bàn giao lại</div>
                    </div>
                    <BeSwitch
                      checked={resetRevokeSessions}
                      onCheckedChange={setResetRevokeSessions}
                      ariaLabel="Đăng xuất mọi thiết bị"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button type="button" onClick={() => setResetTarget(null)} className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold dark:border-neutral-700">
                    Hủy
                  </button>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
                    <Check className="h-3.5 w-3.5" />
                    Xác nhận đặt lại
                  </button>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: CREATE PLATFORM ADMIN */}
      <AnimatePresence>
        {createAdminOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateAdminOpen(false)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.form
                onSubmit={handleCreateAdmin}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold">Thêm Quản Trị Viên Nội Bộ</h3>
                    <p className="text-[11px] text-neutral-400">Cấp quyền đăng nhập vào Provider Portal.</p>
                  </div>
                  <button type="button" onClick={() => setCreateAdminOpen(false)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3.5 p-6">
                  <BeInput label="Email *" type="email" value={newAdminEmail} onChange={setNewAdminEmail} placeholder="support@pos.vn" />
                  <BeInput label="Tên hiển thị *" value={newAdminName} onChange={setNewAdminName} placeholder="VD: Nhân viên CSKH" />
                  <BeInput label="Mật khẩu *" type="password" value={newAdminPassword} onChange={setNewAdminPassword} />
                  <BeSelect
                    label="Vai trò"
                    value={newAdminRole}
                    onValueChange={(v) => setNewAdminRole(v as "support" | "super_admin")}
                    options={[
                      { value: "support", label: "Support (Xem Org & Reset mật khẩu)" },
                      { value: "super_admin", label: "Super Admin (Toàn quyền)" },
                    ]}
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button type="button" onClick={() => setCreateAdminOpen(false)} className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold dark:border-neutral-700">
                    Hủy
                  </button>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
                    <Check className="h-3.5 w-3.5" />
                    Tạo Tài Khoản
                  </button>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
