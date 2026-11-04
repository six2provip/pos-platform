"use client";

import React, { useCallback, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  Filter,
  KeyRound,
  Layers,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Terminal as TerminalIcon,
  X,
  Zap,
} from "lucide-react";

import { AnimatedList } from "@/components/ui/animated-list";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { fireSuccessConfetti } from "@/components/ui/confetti";
import { DotPattern } from "@/components/ui/dot-pattern";
import { MagicCard } from "@/components/ui/magic-card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { RippleButton } from "@/components/ui/ripple-button";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Terminal } from "@/components/ui/terminal";

interface CustomerRow {
  id: string;
  customer_code: string;
  legal_name: string;
  display_name: string;
  billing_email: string;
  status: string;
}

interface PlanRow {
  id: string;
  plan_code: string;
  name: string;
  deployment_type: string;
  edition: string;
  default_max_stores: number;
  default_max_devices: number;
  default_features: string[];
  offline_grace_days: number;
  status: string;
}

interface SubscriptionRow {
  id: string;
  customer_id: string;
  plan_id: string;
  status: string;
}

interface DeploymentRow {
  id: string;
  customer_id: string;
  subscription_id: string | null;
  deployment_code: string;
  deployment_mode: string;
  organization_id: string;
  organization_name: string;
  lifecycle_status: string;
  connectivity_state?: string;
  release_channel?: string;
  reported_version?: string | null;
  last_heartbeat_at?: string | null;
}

interface OrganizationRow {
  id: string;
  code: string;
  name: string;
  legal_name?: string | null;
  tax_identifier?: string | null;
  default_currency: string;
  timezone: string;
  status: "active" | "pending_approval" | "suspended";
  created_at: string;
  updated_at: string;
  owner_email?: string;
  owner_name?: string;
  owner_phone?: string | null;
}

type AdminTab =
  | "overview"
  | "organizations"
  | "deployments"
  | "licensing"
  | "settings";

export default function SuperAdminWebApp() {
  const [email, setEmail] = useState("superadmin@pos-platform.local");
  const [password, setPassword] = useState("SuperAdmin@123456");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<{
    id: string;
    email: string;
    full_name: string;
    role_code: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [publicKeyInfo, setPublicKeyInfo] = useState<{
    signing_key_id: string;
    signing_public_key_b64: string;
  } | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>("");

  const [issuedEnrollment, setIssuedEnrollment] = useState<{
    enrollment_authorization_id: string;
    deployment_id: string;
    enrollment_token: string;
    expires_at: string;
  } | null>(null);
  const [latestLicenseArtifact, setLatestLicenseArtifact] = useState<{
    license_id?: string;
    sequence?: number;
    license_envelope: Record<string, any>;
  } | null>(null);
  const [heartbeatLogs, setHeartbeatLogs] = useState<
    {
      id: string;
      time: string;
      deployment_code: string;
      status: string;
      details: string;
    }[]
  >([]);

  const [newCustCode, setNewCustCode] = useState("CUST-WINMART");
  const [newCustName, setNewCustName] = useState("WinMart Retail Group");
  const [newCustEmail, setNewCustEmail] = useState("it-ops@winmart.vn");
  const [newPlanCode, setNewPlanCode] = useState("PRIVATE-ENTERPRISE-10S");
  const [newPlanMaxStores, setNewPlanMaxStores] = useState("10");
  const [newPlanMaxDevices, setNewPlanMaxDevices] = useState("30");
  const [newDepCode, setNewDepCode] = useState("DEP-WINMART-PRIVATE-01");
  const [newDepMode, setNewDepMode] = useState<"private" | "cloud">("private");

  // Organizations & Direct Provisioning State (Luồng 1 & Luồng 2)
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [orgFilter, setOrgFilter] = useState<
    "all" | "pending_approval" | "active" | "suspended"
  >("all");
  const [orgSearch, setOrgSearch] = useState("");
  const [showDirectOrgModal, setShowDirectOrgModal] = useState(false);
  const [provisionedOrgResult, setProvisionedOrgResult] = useState<{
    orgName: string;
    orgCode: string;
    ownerEmail: string;
    password?: string;
  } | null>(null);

  const [directOrgCode, setDirectOrgCode] = useState("COFFEE-HOUSE");
  const [directOrgName, setDirectOrgName] = useState("The Coffee House VN");
  const [directOwnerEmail, setDirectOwnerEmail] = useState("owner@coffeehouse.vn");
  const [directOwnerPassword, setDirectOwnerPassword] = useState("Owner@123456");
  const [directOwnerName, setDirectOwnerName] = useState("Chủ Doanh Nghiệp");
  const [directStoreCode, setDirectStoreCode] = useState("TCH-D1");
  const [directStoreName, setDirectStoreName] = useState("Chi nhánh Quận 1");

  const notify = useCallback(
    (type: "success" | "error" | "info", text: string) => {
      setBanner({ type, text });
    },
    []
  );

  const cpFetch = useCallback(
    async (
      path: string,
      options: RequestInit = {},
      tokenOverride?: string | null
    ) => {
      const tk = tokenOverride !== undefined ? tokenOverride : adminToken;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };
      if (tk) {
        headers["Authorization"] = `Bearer ${tk}`;
      }
      const res = await fetch(path, {
        ...options,
        headers,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        const msg =
          json?.message ||
          json?.error?.code ||
          `HTTP ${res.status} error calling ${path}`;
        throw new Error(msg);
      }
      return json?.data;
    },
    [adminToken]
  );

  const refreshControlPlaneData = useCallback(
    async (tkOverride?: string) => {
      const tk = tkOverride || adminToken;
      if (!tk) return;
      try {
        const [healthData, custList, planList, subList, depList, orgList] =
          await Promise.all([
            cpFetch("/control/v1/health", {}, null).catch(() => null),
            cpFetch("/control/admin/v1/customers", {}, tk).catch(() => []),
            cpFetch("/control/admin/v1/plans", {}, tk).catch(() => []),
            cpFetch("/control/admin/v1/subscriptions", {}, tk).catch(() => []),
            cpFetch("/control/admin/v1/deployments", {}, tk).catch(() => []),
            fetch("/api/v1/organization/list-all")
              .then((r) => r.json())
              .then((j) => (j?.success && Array.isArray(j.data) ? j.data : []))
              .catch(() => []),
          ]);

        if (healthData) {
          setPublicKeyInfo({
            signing_key_id: healthData.signing_key_id || "cp-ed25519-2026-01",
            signing_public_key_b64: healthData.signing_public_key_b64 || "",
          });
        }
        setCustomers(Array.isArray(custList) ? custList : []);
        setPlans(Array.isArray(planList) ? planList : []);
        setSubscriptions(Array.isArray(subList) ? subList : []);
        setOrganizations(Array.isArray(orgList) ? orgList : []);
        const deps: DeploymentRow[] = Array.isArray(depList) ? depList : [];
        setDeployments(deps);
        if (deps.length > 0 && !selectedDeploymentId) {
          setSelectedDeploymentId(deps[0].id);
        }
      } catch (err: any) {
        notify("error", err.message || "Không thể tải dữ liệu Control Plane");
      }
    },
    [adminToken, cpFetch, notify, selectedDeploymentId]
  );

  const seedInitialControlPlaneIfEmpty = useCallback(
    async (tk: string, existingDeps: DeploymentRow[]) => {
      if (existingDeps.length > 0) return;
      try {
        const cust = await cpFetch(
          "/control/admin/v1/customers",
          {
            method: "POST",
            body: JSON.stringify({
              customer_code: "CUST-LOTUS-VN",
              legal_name: "Lotus Mart Retail Vietnam Co., Ltd",
              display_name: "Lotus Mart Vietnam",
              billing_email: "infra@lotusmart.vn",
            }),
          },
          tk
        );

        const plan = await cpFetch(
          "/control/admin/v1/plans",
          {
            method: "POST",
            body: JSON.stringify({
              plan_code: "PRIVATE-PRO-5S",
              name: "Private Server Pro (5 Stores / 15 POS Devices)",
              deployment_type: "private",
              edition: "enterprise",
              default_max_stores: 5,
              default_max_devices: 15,
              default_features: ["pos", "inventory", "reports", "offline_sync"],
              offline_grace_days: 7,
            }),
          },
          tk
        );

        const sub = await cpFetch(
          "/control/admin/v1/subscriptions",
          {
            method: "POST",
            body: JSON.stringify({
              customer_id: cust.id,
              plan_id: plan.id,
            }),
          },
          tk
        );

        const dep = await cpFetch(
          "/control/admin/v1/deployments",
          {
            method: "POST",
            body: JSON.stringify({
              customer_id: cust.id,
              subscription_id: sub.id,
              deployment_code: "DEP-LOTUS-PRIVATE-HCM",
              deployment_mode: "private",
              organization_id: "018f2b10-0000-7000-8000-000000000101",
              organization_name: "Lotus Mart Vietnam",
              release_channel: "stable",
            }),
          },
          tk
        );

        setSelectedDeploymentId(dep.id);
      } catch {
        // ignore if already seeded
      }
    },
    [cpFetch]
  );

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setBanner(null);
    try {
      const data = await cpFetch(
        "/control/admin/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        },
        null
      );

      const tk = data.access_token;
      setAdminToken(tk);
      setAdminInfo(data.admin);

      const existingDeps = await cpFetch(
        "/control/admin/v1/deployments",
        {},
        tk
      ).catch(() => []);
      if (Array.isArray(existingDeps) && existingDeps.length === 0) {
        await seedInitialControlPlaneIfEmpty(tk, existingDeps);
      }

      await refreshControlPlaneData(tk);
    } catch (err: any) {
      notify("error", err.message || "Đăng nhập Super-Admin thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFullDeploymentStack = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const suffix = Date.now().toString().slice(-3);
      const cust = await cpFetch("/control/admin/v1/customers", {
        method: "POST",
        body: JSON.stringify({
          customer_code: `${newCustCode.trim().toUpperCase()}-${suffix}`,
          legal_name: `${newCustName.trim()} Co., Ltd`,
          display_name: newCustName.trim(),
          billing_email: newCustEmail.trim(),
        }),
      });

      const plan = await cpFetch("/control/admin/v1/plans", {
        method: "POST",
        body: JSON.stringify({
          plan_code: `${newPlanCode.trim().toUpperCase()}-${suffix}`,
          name: `${newCustName.trim()} (${newPlanMaxStores} Stores / ${newPlanMaxDevices} POS)`,
          deployment_type: newDepMode,
          edition: "enterprise",
          default_max_stores: parseInt(newPlanMaxStores, 10) || 5,
          default_max_devices: parseInt(newPlanMaxDevices, 10) || 15,
          default_features: ["pos", "inventory", "reports", "multi_store"],
          offline_grace_days: 7,
        }),
      });

      const sub = await cpFetch("/control/admin/v1/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer_id: cust.id,
          plan_id: plan.id,
        }),
      });

      const orgUuid = `018f2b10-0000-7000-8000-000000000${suffix}`;
      const dep = await cpFetch("/control/admin/v1/deployments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: cust.id,
          subscription_id: sub.id,
          deployment_code: `${newDepCode.trim().toUpperCase()}-${suffix}`,
          deployment_mode: newDepMode,
          organization_id: orgUuid,
          organization_name: newCustName.trim(),
          release_channel: "stable",
        }),
      });

      setSelectedDeploymentId(dep.id);
      setShowCreateModal(false);
      fireSuccessConfetti();
      await refreshControlPlaneData();
      notify(
        "success",
        `Đã khởi tạo cụm triển khai ${dep.deployment_code} kèm thuê bao Enterprise!`
      );
    } catch (err: any) {
      notify("error", err.message || "Không thể khởi tạo cụm triển khai");
    } finally {
      setLoading(false);
    }
  };

  const handleIssueSignedLicense = async () => {
    if (!selectedDeploymentId) return;
    setLoading(true);
    try {
      const data = await cpFetch(
        `/control/admin/v1/deployments/${selectedDeploymentId}/licenses`,
        {
          method: "POST",
        }
      );
      setLatestLicenseArtifact(data);
      fireSuccessConfetti();
      await refreshControlPlaneData();
      notify(
        "success",
        `Đã ký số Ed25519 và cấp phát License mới (Sequence #${data.sequence})!`
      );
    } catch (err: any) {
      notify("error", err.message || "Không thể cấp phát License");
    } finally {
      setLoading(false);
    }
  };

  const handleIssueEnrollmentToken = async () => {
    if (!selectedDeploymentId) return;
    setLoading(true);
    try {
      const data = await cpFetch(
        `/control/admin/v1/deployments/${selectedDeploymentId}/enrollment-authorizations`,
        {
          method: "POST",
        }
      );
      setIssuedEnrollment(data);
      notify(
        "success",
        `Đã phát hành mã One-Time Enrollment Token (${data.enrollment_token.slice(0, 20)}...)!`
      );
    } catch (err: any) {
      notify("error", err.message || "Không thể sinh Enrollment Token");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePrivateServerEnrollAndHeartbeat = async () => {
    const dep = deployments.find((d) => d.id === selectedDeploymentId);
    if (!dep || !issuedEnrollment) {
      notify(
        "info",
        "Hãy bấm nút '1. Sinh Enrollment Token 1 Lần' trước khi giả lập Private Server Enroll!"
      );
      return;
    }

    setLoading(true);
    try {
      const enrolled = await cpFetch(
        "/control/v1/enrollments",
        {
          method: "POST",
          body: JSON.stringify({
            enrollment_token: issuedEnrollment.enrollment_token,
            deployment_id: dep.id,
            organization_id: dep.organization_id,
            instance_metadata: {
              instance_fingerprint: `fp-${dep.deployment_code.toLowerCase()}`,
              hostname: `${dep.deployment_code.toLowerCase()}-ubuntu-srv`,
              os_info: "Ubuntu 24.04 LTS",
              container_runtime_version: "Docker 29.0",
              app_version: "1.0.0",
            },
          }),
        },
        null
      );

      const instToken = enrolled.deployment_credential?.token;
      setLatestLicenseArtifact({
        license_id: enrolled.license_envelope?.payload?.license_id,
        sequence: enrolled.license_envelope?.payload?.sequence,
        license_envelope: enrolled.license_envelope,
      });

      const hb = await cpFetch(
        "/control/v1/deployments/me/heartbeat",
        {
          method: "POST",
          body: JSON.stringify({
            reported_at: new Date().toISOString(),
            app_version: "1.0.0",
            health_status: "healthy",
            active_store_count: 1,
            active_device_count: 2,
            active_user_count: 5,
            license_sequence:
              enrolled.license_envelope?.payload?.sequence || 1,
          }),
        },
        instToken
      );

      setHeartbeatLogs((prev) => [
        {
          id: `hb-${Date.now()}`,
          time: new Date().toLocaleTimeString("vi-VN"),
          deployment_code: dep.deployment_code,
          status: hb.lifecycle_status || "active",
          details: `Enrolled + Heartbeat OK • License Seq #${enrolled.license_envelope?.payload?.sequence}`,
        },
        ...prev,
      ]);

      fireSuccessConfetti();
      await refreshControlPlaneData();
      notify(
        "success",
        `Private Server (${dep.deployment_code}) đã Enroll, nhận chứng thư số Ed25519 và báo cáo Heartbeat thành công!`
      );
    } catch (err: any) {
      notify(
        "error",
        err.message ||
          "Lỗi giả lập Enroll (Mã Enrollment Token chỉ được phép sử dụng 1 lần)"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeLatestLicense = async () => {
    if (!latestLicenseArtifact?.license_id) return;
    setLoading(true);
    try {
      await cpFetch(
        `/control/admin/v1/licenses/${latestLicenseArtifact.license_id}/revoke`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: "Thu hồi khẩn cấp từ bảng điều khiển Super-Admin",
          }),
        }
      );
      await refreshControlPlaneData();
      notify(
        "info",
        `Đã thu hồi License ${latestLicenseArtifact.license_id} và đình chỉ cụm triển khai!`
      );
    } catch (err: any) {
      notify("error", err.message || "Không thể thu hồi License");
    } finally {
      setLoading(false);
    }
  };

  // Organization Handlers (Luồng 1 Duyệt & Luồng 2 Tạo trực tiếp)
  const handleApproveOrganization = async (org: OrganizationRow) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/organization/${org.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || "Không thể phê duyệt tổ chức");
      }
      fireSuccessConfetti();
      notify(
        "success",
        `Đã phê duyệt tổ chức "${org.name}"! Khách hàng có thể đăng nhập vào cổng Organization (:13000) ngay bây giờ.`
      );
      await refreshControlPlaneData();
    } catch (err: any) {
      notify("error", err.message || "Không thể phê duyệt tổ chức");
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendOrganization = async (org: OrganizationRow) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/organization/${org.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || "Không thể đình chỉ tổ chức");
      }
      notify(
        "info",
        `Đã đình chỉ tổ chức "${org.name}". Tài khoản này sẽ không thể đăng nhập cho đến khi kích hoạt lại.`
      );
      await refreshControlPlaneData();
    } catch (err: any) {
      notify("error", err.message || "Không thể đình chỉ tổ chức");
    } finally {
      setLoading(false);
    }
  };

  const handleDirectProvisionOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/organization/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: directOrgCode.trim().toUpperCase(),
          name: directOrgName.trim(),
          admin_email: directOwnerEmail.trim(),
          admin_password: directOwnerPassword,
          admin_display_name: directOwnerName.trim(),
          initial_store_code: directStoreCode.trim().toUpperCase(),
          initial_store_name: directStoreName.trim(),
          default_currency: "VND",
          timezone_name: "Asia/Ho_Chi_Minh",
          status: "active",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || "Không thể khởi tạo tổ chức trực tiếp");
      }

      setProvisionedOrgResult({
        orgName: directOrgName.trim(),
        orgCode: directOrgCode.trim().toUpperCase(),
        ownerEmail: directOwnerEmail.trim(),
        password: directOwnerPassword,
      });

      setShowDirectOrgModal(false);
      fireSuccessConfetti();
      notify(
        "success",
        `Đã khởi tạo trực tiếp Tổ Chức "${directOrgName}" & Tài khoản Owner (${directOwnerEmail})!`
      );
      await refreshControlPlaneData();
    } catch (err: any) {
      notify("error", err.message || "Không thể khởi tạo tổ chức trực tiếp");
    } finally {
      setLoading(false);
    }
  };

  const pendingOrgs = organizations.filter(
    (o) => o.status === "pending_approval"
  );
  const activeOrgs = organizations.filter((o) => o.status === "active");
  const suspendedOrgs = organizations.filter((o) => o.status === "suspended");

  const filteredOrgs = organizations.filter((org) => {
    if (orgFilter === "pending_approval" && org.status !== "pending_approval")
      return false;
    if (orgFilter === "active" && org.status !== "active") return false;
    if (orgFilter === "suspended" && org.status !== "suspended") return false;
    if (orgSearch.trim()) {
      const q = orgSearch.trim().toLowerCase();
      const matchName = org.name.toLowerCase().includes(q);
      const matchCode = org.code.toLowerCase().includes(q);
      const matchEmail = org.owner_email?.toLowerCase().includes(q);
      return matchName || matchCode || matchEmail;
    }
    return true;
  });

  const selectedDeployment = deployments.find(
    (d) => d.id === selectedDeploymentId
  );

  // ==========================================================================
  // VIEW 1: CLEAN MINIMAL LOGIN SCREEN (CAL.COM STYLE)
  // ==========================================================================
  if (!adminToken) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#F8F9FA] px-4 py-12 text-neutral-900">
        <DotPattern className="opacity-55 [mask-image:radial-gradient(520px_circle_at_center,white,transparent)]" />

        <BlurFade delay={0.04} className="relative z-10 w-full max-w-[420px]">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-2 inline-flex items-center gap-1.5 text-xl font-bold tracking-tight text-neutral-900">
              <span>POS.com</span>
              <span className="rounded bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-700">
                Control Plane
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Provider Super-Admin Console
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Cloud Control Plane API •{" "}
              <code className="font-mono text-xs text-neutral-700">
                127.0.0.1:18001
              </code>
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <BorderBeam
              size={110}
              duration={8}
              colorFrom="#111827"
              colorTo="#9ca3af"
            />

            {banner && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{banner.text}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Email Super-Admin
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Mật khẩu
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div className="pt-1">
                <ShimmerButton
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm"
                >
                  {loading
                    ? "Đang xác thực..."
                    : "Đăng nhập Cloud Control Plane"}
                </ShimmerButton>
              </div>
            </form>
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-neutral-500">
            <span>Port: 13001 → API 18001</span>
            <a
              href="http://127.0.0.1:13000"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-neutral-800 hover:underline"
            >
              Mở Organization Admin & POS (:13000)
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </BlurFade>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 2: CAL.COM SIDEBAR + CLEAN WHITE CONTROL PLANE WORKSPACE
  // ==========================================================================
  return (
    <div className="flex min-h-screen bg-white text-neutral-900">
      {/* Left Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col justify-between border-r border-neutral-200 bg-[#F5F6F8] px-3.5 py-4 select-none">
        <div>
          <div className="flex items-center justify-between px-2 pb-5">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-neutral-900">
                POS.com
              </span>
              <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700">
                Control
              </span>
            </div>
            <Search className="h-4 w-4 text-neutral-500" />
          </div>

          <nav className="space-y-0.5">
            {[
              { id: "overview", label: "Tổng quan Fleet", icon: Layers },
              {
                id: "organizations",
                label: "Tổ Chức & Duyệt Hồ Sơ",
                icon: Building2,
                badge:
                  pendingOrgs.length > 0
                    ? `${pendingOrgs.length} Chờ duyệt`
                    : `${organizations.length}`,
                badgeClass:
                  pendingOrgs.length > 0
                    ? "bg-amber-500 text-white animate-pulse"
                    : "bg-neutral-900 text-white",
              },
              {
                id: "deployments",
                label: "Tenants & Deployments",
                icon: Server,
                badge: `${deployments.length}`,
                badgeClass: "bg-neutral-900 text-white",
              },
              {
                id: "licensing",
                label: "Ed25519 Licensing",
                icon: KeyRound,
              },
              {
                id: "settings",
                label: "Khóa Ký Số & Cài Đặt",
                icon: Settings,
              },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as AdminTab)}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                    isActive
                      ? "bg-neutral-200/85 font-semibold text-neutral-900"
                      : "font-medium text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? "text-neutral-900" : "text-neutral-500"
                      }`}
                    />
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.badgeClass || "bg-neutral-900 text-white"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Callout Card + Profile */}
        <div className="space-y-3 pt-4">
          <div className="relative">
            <div className="mx-2 h-1.5 rounded-t-lg border border-b-0 border-neutral-200 bg-white/70" />
            <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm">
              <div className="text-xs font-semibold text-neutral-900">
                Chữ ký số Ed25519
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                Xác thực chứng thư số License Offline chống giả mạo trên mọi
                Private Server.
              </p>
              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveTab("licensing")}
                  className="font-semibold text-neutral-900 hover:underline"
                >
                  Cấp License ngay
                </button>
                <button
                  type="button"
                  onClick={() => void refreshControlPlaneData()}
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  Làm mới
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-200/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                SA
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-neutral-900">
                  {adminInfo?.full_name || "Super Admin"}
                </div>
                <div className="truncate text-[11px] text-neutral-500">
                  control.pos.com
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAdminToken(null)}
              title="Đăng xuất"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-white px-8 py-7">
        {banner && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-800 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-neutral-900 shrink-0" />
              <span className="font-medium">{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-neutral-400 hover:text-neutral-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 1: OVERVIEW (CAL.COM HERO + 6-CARD FEATURE GRID)             */}
        {/* ================================================================ */}
        {activeTab === "overview" && (
          <BlurFade delay={0.03} className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  Cloud Control Plane & Fleet Licensing
                </h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Quản trị tập trung các cụm Cloud Multi-Tenant và Private
                  Server Single-Tenant trên toàn cầu.
                </p>
              </div>
              <ShimmerButton onClick={() => setShowCreateModal(true)}>
                <Plus className="h-3.5 w-3.5" />+ Tạo Deployment Mới
              </ShimmerButton>
            </div>

            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-gradient-to-r from-[#D5DCE6]/80 via-[#E2E7EE]/70 to-[#EFECE6]/80 p-8">
              <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                <div className="lg:col-span-6 space-y-4">
                  <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
                    Kiểm soát Bản quyền & Private Server từ xa
                  </h2>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    Cấp phát chứng thư số Ed25519 chống giả mạo, sinh mã
                    One-Time Enrollment Token cho máy chủ riêng và giám sát
                    Heartbeat định kỳ không xâm phạm dữ liệu nhạy cảm.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <ShimmerButton onClick={() => setActiveTab("licensing")}>
                      Cấp Phát License Ed25519
                    </ShimmerButton>
                    <RippleButton onClick={() => setShowCreateModal(true)}>
                      + Thêm Khách Hàng Mới
                    </RippleButton>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.08)]">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                      <div>
                        <div className="text-xs font-bold text-neutral-900">
                          Ed25519 Signing Authority
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Key ID:{" "}
                          <code className="font-mono text-neutral-800">
                            {publicKeyInfo?.signing_key_id ||
                              "cp-ed25519-2026-01"}
                          </code>
                        </div>
                      </div>
                      <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        ONLINE
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                      <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-2">
                        <div className="text-[10px] text-neutral-400 uppercase">
                          Orgs
                        </div>
                        <div className="mt-0.5 text-base font-bold text-neutral-900">
                          <NumberTicker value={organizations.length} />
                        </div>
                      </div>
                      <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-2">
                        <div className="text-[10px] text-neutral-400 uppercase">
                          Customers
                        </div>
                        <div className="mt-0.5 text-base font-bold text-neutral-900">
                          <NumberTicker value={customers.length} />
                        </div>
                      </div>
                      <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-2">
                        <div className="text-[10px] text-neutral-400 uppercase">
                          Plans
                        </div>
                        <div className="mt-0.5 text-base font-bold text-neutral-900">
                          <NumberTicker value={plans.length} />
                        </div>
                      </div>
                      <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-2">
                        <div className="text-[10px] text-neutral-400 uppercase">
                          Subs
                        </div>
                        <div className="mt-0.5 text-base font-bold text-neutral-900">
                          <NumberTicker value={subscriptions.length} />
                        </div>
                      </div>
                      <div className="rounded-lg bg-neutral-900 p-2 text-white">
                        <div className="text-[10px] text-neutral-300 uppercase">
                          Fleet
                        </div>
                        <div className="mt-0.5 text-base font-bold text-white">
                          <NumberTicker
                            value={deployments.length}
                            className="text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 6-Card 3-Column Feature Grid */}
            <BentoGrid>
              <BentoCard
                name="Ký số License Ed25519 (RFC 8785)"
                description="Mỗi chứng thư License được chuẩn hóa Canonical JSON và ký bằng khóa bí mật Ed25519 kèm số thứ tự chống hạ cấp."
                Icon={KeyRound}
                iconColorClass="text-rose-500"
                badge="Ed25519"
                cta="Mở Trình Ký Số License"
                onAction={() => setActiveTab("licensing")}
              />

              <BentoCard
                name="One-Time Private Server Enrollment"
                description="Sinh mã Enrollment Token chỉ dùng 1 lần để máy chủ On-Premise đăng ký định danh phần cứng và nhận chứng thư."
                Icon={TerminalIcon}
                iconColorClass="text-sky-500"
                badge="Zero-Trust Bootstrap"
                cta="Sinh Enrollment Token"
                onAction={() => setActiveTab("licensing")}
              />

              <BentoCard
                name="Giám sát Heartbeat Bảo mật"
                description="Chỉ thu thập chỉ số vận hành tổng hợp (số cửa hàng, số máy POS, phiên bản) — tuyệt đối không chứa dữ liệu hóa đơn."
                Icon={Activity}
                iconColorClass="text-emerald-500"
                badge={`${heartbeatLogs.length} Heartbeats`}
                cta="Giả lập gửi Heartbeat"
                onAction={() => setActiveTab("licensing")}
              />

              <BentoCard
                name="Quản lý Khách hàng & Gói cước"
                description="Định nghĩa hạn mức max_stores, max_devices và số ngày ân hạn Offline (Grace Period) cho từng gói thuê bao."
                Icon={Building2}
                iconColorClass="text-amber-500"
                badge={`${customers.length} Doanh nghiệp`}
                cta="Xem danh sách Deployments"
                onAction={() => setActiveTab("deployments")}
              />

              <BentoCard
                name="Duyệt Hồ Sơ & Quản Lý Tổ Chức POS"
                description="Hỗ trợ 2 luồng: Phê duyệt doanh nghiệp tự đăng ký từ cổng Web (Luồng 1) và Khởi tạo trực tiếp tài khoản Owner bàn giao ngay (Luồng 2)."
                Icon={Building2}
                iconColorClass="text-emerald-500"
                badge={
                  pendingOrgs.length > 0
                    ? `${pendingOrgs.length} Chờ Duyệt`
                    : `${organizations.length} Tổ Chức`
                }
                cta="Quản Lý & Duyệt Hồ Sơ"
                onAction={() => setActiveTab("organizations")}
              />

              <BentoCard
                name="Đình chỉ & Thu hồi Khẩn cấp"
                description="Thu hồi chứng thư License hoặc khóa cụm triển khai từ xa ngay khi phát hiện vi phạm hợp đồng."
                Icon={ShieldAlert}
                iconColorClass="text-purple-500"
                badge="Remote Kill-Switch"
                cta="Quản lý Trạng thái License"
                onAction={() => setActiveTab("licensing")}
              />

              <BentoCard
                name="Khóa Công Khai Ed25519"
                description="Phân phối Public Key để các cụm Private Server xác thực chữ ký cục bộ không cần kết nối mạng liên tục."
                Icon={ShieldCheck}
                iconColorClass="text-indigo-500"
                badge="Public Key Ring"
                cta="Xem Khóa Công Khai"
                onAction={() => setActiveTab("settings")}
              />
            </BentoGrid>
          </BlurFade>
        )}

        {/* ================================================================ */}
        {/* TAB 2: ORGANIZATIONS & APPROVALS (LUỒNG 1 & LUỒNG 2)             */}
        {/* ================================================================ */}
        {activeTab === "organizations" && (
          <BlurFade delay={0.03} className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                    Quản Lý Tổ Chức & Duyệt Hồ Sơ Doanh Nghiệp
                  </h1>
                  {pendingOrgs.length > 0 && (
                    <span className="rounded-full bg-amber-500/15 border border-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-700 animate-pulse">
                      {pendingOrgs.length} Chờ Duyệt
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Duyệt hồ sơ tự đăng ký từ cổng Web (Luồng 1) hoặc Khởi tạo trực tiếp tổ chức kèm tài khoản Owner (Luồng 2).
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <RippleButton onClick={() => void refreshControlPlaneData()}>
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Làm Mới
                </RippleButton>
                <ShimmerButton onClick={() => setShowDirectOrgModal(true)}>
                  <Plus className="h-3.5 w-3.5" />+ Tạo Tổ Chức & Owner Trực Tiếp
                </ShimmerButton>
              </div>
            </div>

            {/* Success Callout after direct creation */}
            {provisionedOrgResult && (
              <div className="relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-900 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">
                        Đã khởi tạo thành công Tổ Chức: {provisionedOrgResult.orgName} ({provisionedOrgResult.orgCode})
                      </div>
                      <p className="mt-1 text-xs text-emerald-800">
                        Thông tin đăng nhập bàn giao cho khách hàng (đăng nhập tại cổng Organization:{" "}
                        <a href="http://127.0.0.1:13000" target="_blank" rel="noreferrer" className="underline font-semibold">
                          http://127.0.0.1:13000
                        </a>
                        ):
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-mono">
                        <span className="rounded bg-white/90 border border-emerald-300 px-2.5 py-1">
                          Email: <strong>{provisionedOrgResult.ownerEmail}</strong>
                        </span>
                        {provisionedOrgResult.password && (
                          <span className="rounded bg-white/90 border border-emerald-300 px-2.5 py-1">
                            Password: <strong>{provisionedOrgResult.password}</strong>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `URL: http://127.0.0.1:13000\nEmail: ${provisionedOrgResult.ownerEmail}\nPassword: ${provisionedOrgResult.password || ""}`
                            );
                            notify("info", "Đã sao chép thông tin tài khoản bàn giao!");
                          }}
                          className="inline-flex items-center gap-1 rounded bg-emerald-700 text-white px-2.5 py-1 text-xs font-sans font-medium hover:bg-emerald-800 transition-colors"
                        >
                          <Copy className="h-3 w-3" /> Sao chép thông tin
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProvisionedOrgResult(null)}
                    className="text-emerald-600 hover:text-emerald-900 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Stat Counters Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Tổng Doanh Nghiệp
                </div>
                <div className="mt-1 text-2xl font-bold text-neutral-900">
                  <NumberTicker value={organizations.length} />
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  Đã đăng ký trên toàn hệ thống
                </div>
              </div>

              <div className={`rounded-xl border p-4 shadow-sm transition-all ${
                pendingOrgs.length > 0
                  ? "border-amber-300 bg-amber-50/50"
                  : "border-neutral-200 bg-white"
              }`}>
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-amber-700">
                  <span>Hồ Sơ Chờ Duyệt</span>
                  {pendingOrgs.length > 0 && (
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  )}
                </div>
                <div className="mt-1 text-2xl font-bold text-amber-900">
                  <NumberTicker value={pendingOrgs.length} />
                </div>
                <div className="mt-1 text-[11px] text-amber-700">
                  {pendingOrgs.length > 0 ? "Cần Super-Admin duyệt để kích hoạt" : "Không có hồ sơ tồn đọng"}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">
                  Đang Hoạt Động
                </div>
                <div className="mt-1 text-2xl font-bold text-emerald-800">
                  <NumberTicker value={activeOrgs.length} />
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  Được cấp quyền bán hàng & truy cập
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-rose-700">
                  Đã Đình Chỉ
                </div>
                <div className="mt-1 text-2xl font-bold text-rose-800">
                  <NumberTicker value={suspendedOrgs.length} />
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  Bị khóa tạm thời hoặc từ chối
                </div>
              </div>
            </div>

            {/* Filter Pills & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: "all", label: `Tất cả (${organizations.length})` },
                  {
                    id: "pending_approval",
                    label: `⏳ Chờ duyệt (${pendingOrgs.length})`,
                    alert: pendingOrgs.length > 0,
                  },
                  { id: "active", label: `✓ Hoạt động (${activeOrgs.length})` },
                  { id: "suspended", label: `✕ Đình chỉ (${suspendedOrgs.length})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOrgFilter(f.id as any)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      orgFilter === f.id
                        ? "bg-neutral-900 text-white shadow-sm"
                        : f.alert
                        ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Tìm tên tổ chức, mã code, email owner..."
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white py-1.5 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                />
              </div>
            </div>

            {/* List of Organizations */}
            <div className="space-y-3">
              {filteredOrgs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 py-12 text-center text-xs text-neutral-500">
                  Không tìm thấy tổ chức nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                filteredOrgs.map((org) => {
                  const isPending = org.status === "pending_approval";
                  const isActive = org.status === "active";
                  const isSuspended = org.status === "suspended";

                  return (
                    <div
                      key={org.id}
                      className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 transition-all shadow-sm ${
                        isPending
                          ? "border-amber-300 bg-amber-50/20 hover:border-amber-400"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                            isPending
                              ? "border-amber-300 bg-amber-100 text-amber-800"
                              : "border-neutral-200 bg-neutral-50 text-neutral-700"
                          }`}
                        >
                          <Building2 className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-neutral-900">
                              {org.name}
                            </span>
                            <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs font-semibold text-neutral-700">
                              {org.code}
                            </span>
                            {isPending && (
                              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                                ⏳ Chờ Phê Duyệt
                              </span>
                            )}
                            {isActive && (
                              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                                ✓ Đang Hoạt Động
                              </span>
                            )}
                            {isSuspended && (
                              <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                                ✕ Đã Đình Chỉ
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                            <span>
                              Chủ sở hữu:{" "}
                              <strong className="font-semibold text-neutral-800">
                                {org.owner_name || "Chưa gán"}
                              </strong>{" "}
                              {org.owner_email && (
                                <code className="text-neutral-600 font-mono">
                                  ({org.owner_email})
                                </code>
                              )}
                            </span>
                            <span>
                              Đăng ký:{" "}
                              {new Date(org.created_at).toLocaleDateString("vi-VN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span>
                              Tiền tệ: <strong className="text-neutral-700">{org.default_currency}</strong> • {org.timezone}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isPending && (
                          <>
                            <ShimmerButton
                              onClick={() => void handleApproveOrganization(org)}
                              disabled={loading}
                              className="px-3.5 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-800"
                            >
                              <Check className="h-3.5 w-3.5 text-emerald-300" />
                              Duyệt & Kích Hoạt
                            </ShimmerButton>
                            <button
                              type="button"
                              onClick={() => void handleSuspendOrganization(org)}
                              disabled={loading}
                              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 hover:border-rose-300 transition-colors"
                            >
                              Từ Chối
                            </button>
                          </>
                        )}

                        {isActive && (
                          <>
                            <a
                              href="http://127.0.0.1:13000"
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                            >
                              Mở Portal (:13000)
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleSuspendOrganization(org)}
                              disabled={loading}
                              className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                            >
                              Đình chỉ
                            </button>
                          </>
                        )}

                        {isSuspended && (
                          <button
                            type="button"
                            onClick={() => void handleApproveOrganization(org)}
                            disabled={loading}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Kích Hoạt Lại
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </BlurFade>
        )}

        {/* ================================================================ */}
        {/* TAB 2: TENANTS & DEPLOYMENTS (STACKED CAL.COM APPS ROWS)         */}
        {/* ================================================================ */}
        {activeTab === "deployments" && (
          <BlurFade delay={0.03} className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  Khách Hàng, Gói Cước & Cụm Triển Khai
                </h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Danh sách toàn bộ các cụm Cloud Multi-Tenant và Private
                  Single-Tenant đang đăng ký.
                </p>
              </div>
              <ShimmerButton onClick={() => setShowCreateModal(true)}>
                <Plus className="h-3.5 w-3.5" />+ Tạo Deployment Mới
              </ShimmerButton>
            </div>

            <div className="space-y-3">
              {deployments.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
                      <Server className="h-5 w-5 text-neutral-800" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-neutral-900">
                          {d.organization_name}
                        </span>
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700">
                          {d.deployment_code}
                        </span>
                        <span className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
                          {d.deployment_mode}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        Organization UUID:{" "}
                        <code className="font-mono">{d.organization_id}</code> •
                        Trạng thái:{" "}
                        <strong className="text-neutral-900">
                          {d.lifecycle_status.toUpperCase()}
                        </strong>
                      </p>
                    </div>
                  </div>

                  <RippleButton
                    onClick={() => {
                      setSelectedDeploymentId(d.id);
                      setActiveTab("licensing");
                    }}
                  >
                    Cấp License & Enroll →
                  </RippleButton>
                </div>
              ))}
            </div>
          </BlurFade>
        )}

        {/* ================================================================ */}
        {/* TAB 3: ED25519 LICENSING & PRIVATE SERVER ENROLLMENT             */}
        {/* ================================================================ */}
        {activeTab === "licensing" && (
          <BlurFade delay={0.03} className="space-y-6">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  Ký Số License Ed25519 & Private Server Enrollment
                </h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Phát hành mã Enrollment 1 lần, giả lập Private Server kết nối
                  và kiểm tra chữ ký số Ed25519.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              {/* Left 5 Cols: Controls */}
              <div className="lg:col-span-5 space-y-5">
                <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                      Cụm Triển Khai Đích (Target Deployment)
                    </label>
                    <select
                      value={selectedDeploymentId}
                      onChange={(e) => setSelectedDeploymentId(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    >
                      {deployments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.deployment_code} — {d.organization_name} (
                          {d.lifecycle_status})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedDeployment && (
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3.5 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Mã Cụm:</span>
                        <span className="font-mono font-semibold text-neutral-900">
                          {selectedDeployment.deployment_code}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Org UUID:</span>
                        <span className="font-mono text-neutral-700">
                          {selectedDeployment.organization_id.slice(0, 18)}...
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Trạng thái:</span>
                        <span className="font-semibold text-emerald-700">
                          {selectedDeployment.lifecycle_status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5 pt-1">
                    <RippleButton
                      onClick={() => void handleIssueEnrollmentToken()}
                      disabled={loading || !selectedDeploymentId}
                      className="w-full justify-center py-2.5"
                    >
                      1. Sinh Enrollment Token 1 Lần
                    </RippleButton>

                    <ShimmerButton
                      onClick={() =>
                        void handleSimulatePrivateServerEnrollAndHeartbeat()
                      }
                      disabled={loading || !selectedDeploymentId}
                      className="w-full py-2.5"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      2. Giả lập Private Server Enroll & Heartbeat
                    </ShimmerButton>

                    <RippleButton
                      onClick={() => void handleIssueSignedLicense()}
                      disabled={loading || !selectedDeploymentId}
                      className="w-full justify-center py-2.5"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Ký Số & Gia Hạn License Ed25519 Mới
                    </RippleButton>

                    {latestLicenseArtifact?.license_id && (
                      <button
                        type="button"
                        onClick={() => void handleRevokeLatestLicense()}
                        disabled={loading}
                        className="w-full rounded-lg border border-rose-200 bg-rose-50 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Thu Hồi License Khẩn Cấp (Revoke)
                      </button>
                    )}
                  </div>
                </div>

                {/* Heartbeat Logs */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Nhật Ký Enrollment & Heartbeat ({heartbeatLogs.length})
                  </h3>
                  <div className="mt-3 space-y-2">
                    {heartbeatLogs.length === 0 ? (
                      <p className="text-xs text-neutral-400">
                        Bấm bước 1 và bước 2 ở trên để ghi nhận luồng Heartbeat
                        đầu tiên.
                      </p>
                    ) : (
                      <AnimatedList>
                        {heartbeatLogs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs"
                          >
                            <div className="flex justify-between font-semibold text-neutral-900">
                              <span>{log.deployment_code}</span>
                              <span className="text-neutral-500">
                                {log.time}
                              </span>
                            </div>
                            <div className="mt-1 text-neutral-600">
                              {log.details}
                            </div>
                          </div>
                        ))}
                      </AnimatedList>
                    )}
                  </div>
                </div>
              </div>

              {/* Right 7 Cols: CLI & Signed License Artifact Inspector */}
              <div className="lg:col-span-7 space-y-5">
                {issuedEnrollment && (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 space-y-3">
                    <div className="text-xs font-bold text-neutral-900">
                      Câu lệnh Bootstrap trên Máy Chủ Private Server:
                    </div>
                    <Terminal title="infrastructure/private-server/scripts/enroll.sh">
                      <div className="text-emerald-300">
                        ./scripts/enroll.sh \
                      </div>
                      <div className="text-neutral-300 pl-4">
                        --control-url &quot;http://127.0.0.1:18001&quot; \
                      </div>
                      <div className="text-amber-300 pl-4">
                        --token &quot;{issuedEnrollment.enrollment_token}&quot;
                      </div>
                    </Terminal>
                  </div>
                )}

                <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-6">
                  {latestLicenseArtifact && (
                    <BorderBeam
                      size={120}
                      duration={6}
                      colorFrom="#111827"
                      colorTo="#6b7280"
                    />
                  )}
                  <h3 className="text-sm font-bold text-neutral-900">
                    Chứng Thư Số License Ed25519 (SignedLicenseEnvelope)
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5 mb-4">
                    Cấu trúc JSON chuẩn RFC 8785 kèm chữ ký số Ed25519 dùng để
                    xác thực Offline trên Private Server.
                  </p>

                  {latestLicenseArtifact ? (
                    <Terminal title="signed-license-envelope.json">
                      <pre className="text-xs text-emerald-300 max-h-96 overflow-y-auto">
                        {JSON.stringify(
                          latestLicenseArtifact.license_envelope,
                          null,
                          2
                        )}
                      </pre>
                    </Terminal>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-200 py-14 text-center text-xs text-neutral-400">
                      Hãy bấm &ldquo;Ký Số & Gia Hạn License Ed25519 Mới&rdquo;
                      hoặc thực hiện bước 1 & 2 ở cột bên trái để xem chứng thư
                      số.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </BlurFade>
        )}

        {/* ================================================================ */}
        {/* TAB 4: SETTINGS & PUBLIC KEY                                     */}
        {/* ================================================================ */}
        {activeTab === "settings" && (
          <BlurFade delay={0.03} className="max-w-2xl space-y-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                Khóa Công Khai Ed25519 & Cấu Hình Control Plane
              </h1>
              <p className="mt-0.5 text-sm text-neutral-500">
                Cấu hình cặp khóa mật mã bất đối xứng dùng để ký chứng thư
                License.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-neutral-900">
                  Active Ed25519 Verification Key
                </div>
                <p className="text-xs text-neutral-500">
                  Khóa công khai này được nhúng vào biến môi trường{" "}
                  <code>TRUSTED_LICENSE_PUBLIC_KEYS</code> trên các Private
                  Server.
                </p>
              </div>
              <Terminal title="GET /control/v1/health">
                <div className="text-emerald-300">
                  signing_key_id: &quot;{publicKeyInfo?.signing_key_id}&quot;
                </div>
                <div className="text-neutral-200 break-all mt-1">
                  signing_public_key_b64: &quot;
                  {publicKeyInfo?.signing_public_key_b64}&quot;
                </div>
              </Terminal>
            </div>
          </BlurFade>
        )}
      </main>

      {/* ================================================================== */}
      {/* CLEAN CENTERED MODAL DIALOG (CAL.COM SCREENSHOT 5 STYLE)           */}
      {/* ================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-[1px] p-4">
          <BlurFade
            delay={0.01}
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    Khởi Tạo Cụm Triển Khai Mới
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Tự động tạo Customer, Plan, Subscription & Deployment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreateFullDeploymentStack}
              className="mt-5 space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Tên Doanh Nghiệp / Chuỗi
                </label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Mã Khách Hàng
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustCode}
                    onChange={(e) => setNewCustCode(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Chế Độ Triển Khai
                  </label>
                  <select
                    value={newDepMode}
                    onChange={(e) =>
                      setNewDepMode(e.target.value as "private" | "cloud")
                    }
                    className="w-full rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-none"
                  >
                    <option value="private">Private Server</option>
                    <option value="cloud">Cloud Multi-Tenant</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Số Cửa Hàng Tối Đa
                  </label>
                  <input
                    type="number"
                    required
                    value={newPlanMaxStores}
                    onChange={(e) => setNewPlanMaxStores(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Số Máy POS Tối Đa
                  </label>
                  <input
                    type="number"
                    required
                    value={newPlanMaxDevices}
                    onChange={(e) => setNewPlanMaxDevices(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <RippleButton
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                >
                  Hủy
                </RippleButton>
                <ShimmerButton type="submit" disabled={loading}>
                  Khởi Tạo Ngay
                </ShimmerButton>
              </div>
            </form>
          </BlurFade>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL: DIRECT ORG & OWNER PROVISIONING (LUỒNG 2)                   */}
      {/* ================================================================== */}
      {showDirectOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-[1px] p-4">
          <BlurFade
            delay={0.01}
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    Khởi Tạo Tổ Chức & Owner Trực Tiếp (Luồng 2)
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Super-Admin cấp trực tiếp tài khoản doanh nghiệp kích hoạt ngay và bàn giao
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDirectOrgModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleDirectProvisionOrganization}
              className="mt-5 space-y-3.5"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Mã Tổ Chức (Code)
                  </label>
                  <input
                    type="text"
                    required
                    value={directOrgCode}
                    onChange={(e) => setDirectOrgCode(e.target.value)}
                    placeholder="VD: HIGHLANDS"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 uppercase font-mono focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Tên Doanh Nghiệp / Chuỗi
                  </label>
                  <input
                    type="text"
                    required
                    value={directOrgName}
                    onChange={(e) => setDirectOrgName(e.target.value)}
                    placeholder="VD: Highlands Coffee VN"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-3">
                <div className="text-xs font-bold text-neutral-800">
                  Tài khoản Chủ Sở Hữu (Organization Owner)
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Họ & Tên Chủ Sở Hữu
                  </label>
                  <input
                    type="text"
                    required
                    value={directOwnerName}
                    onChange={(e) => setDirectOwnerName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Email Đăng Nhập
                    </label>
                    <input
                      type="email"
                      required
                      value={directOwnerEmail}
                      onChange={(e) => setDirectOwnerEmail(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Mật Khẩu Ban Đầu
                    </label>
                    <input
                      type="password"
                      required
                      value={directOwnerPassword}
                      onChange={(e) => setDirectOwnerPassword(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Mã Cửa Hàng Đầu Tiên
                  </label>
                  <input
                    type="text"
                    required
                    value={directStoreCode}
                    onChange={(e) => setDirectStoreCode(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 font-mono uppercase focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Tên Cửa Hàng
                  </label>
                  <input
                    type="text"
                    required
                    value={directStoreName}
                    onChange={(e) => setDirectStoreName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <RippleButton
                  type="button"
                  onClick={() => setShowDirectOrgModal(false)}
                >
                  Hủy
                </RippleButton>
                <ShimmerButton type="submit" disabled={loading}>
                  {loading ? "Đang Khởi Tạo..." : "Kích Hoạt & Bàn Giao Ngay"}
                </ShimmerButton>
              </div>
            </form>
          </BlurFade>
        </div>
      )}
    </div>
  );
}
