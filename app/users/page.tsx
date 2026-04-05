"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { useUser } from "@/components/UserContext";

type User = {
  id: number;
  username: string;
  full_name: string;
  role: string;
  office_level: string;
  province: string | null;
  municipality: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

const ROLES = ["super_admin", "admin", "editor", "viewer"];
const OFFICE_LEVELS = ["regional", "provincial", "municipal"];

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin:       "bg-blue-100 text-blue-700",
  editor:      "bg-amber-100 text-amber-700",
  viewer:      "bg-gray-100 text-gray-600",
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin:       "Admin",
  editor:      "Editor",
  viewer:      "Viewer",
};

const LEVEL_BADGE: Record<string, string> = {
  regional:   "bg-green-100 text-green-700",
  provincial: "bg-teal-100 text-teal-700",
  municipal:  "bg-sky-100 text-sky-700",
};

type ModalMode = "create" | "edit" | "reset_password";

type FormState = {
  username: string;
  full_name: string;
  role: string;
  office_level: string;
  province: string;
  municipality: string;
  password: string;
};

const emptyForm = (): FormState => ({
  username: "", full_name: "", role: "viewer",
  office_level: "regional", province: "", municipality: "", password: "",
});

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$%&!";
  const all = upper + lower + digits + special;
  let pw =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 12; i++) pw += all[Math.floor(Math.random() * all.length)];
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}

export default function UsersPage() {
  const { user: sessionUser } = useUser();
  const isRegional = sessionUser?.office_level === "regional";

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [resetPassword, setResetPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [provinces, setProvinces] = useState<string[]>([]);
  const toast = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    fetch("/api/provinces")
      .then((r) => r.json())
      .then((d) => setProvinces(d.provinces ?? []));
  }, []);

  function openCreate() {
    setForm({
      ...emptyForm(),
      office_level: isRegional ? "regional" : "provincial",
      province: isRegional ? "" : (sessionUser?.province ?? ""),
    });
    setShowPassword(false);
    setModalMode("create");
    setSelectedUser(null);
  }

  function openEdit(u: User) {
    setForm({
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      office_level: u.office_level,
      province: u.province ?? "",
      municipality: u.municipality ?? "",
      password: "",
    });
    setSelectedUser(u);
    setModalMode("edit");
  }

  function openResetPassword(u: User) {
    setResetPassword("");
    setShowPassword(false);
    setSelectedUser(u);
    setModalMode("reset_password");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedUser(null);
    setGeneratedPassword(null);
    setCopied(false);
  }

  async function handleCreate() {
    if (!form.username.trim() || !form.full_name.trim()) {
      toast("Please fill in all required fields.", "error"); return;
    }
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast(data.error ?? "Failed to create user.", "error"); return; }
    fetchUsers();
    if (data.generated_password) {
      setGeneratedPassword(data.generated_password);
    } else {
      toast("User created successfully.", "success");
      closeModal();
    }
  }

  async function handleEdit() {
    if (!selectedUser) return;
    if (!form.full_name.trim()) { toast("Full name is required.", "error"); return; }
    setSaving(true);
    const res = await fetch(`/api/users/${selectedUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: form.full_name,
        role: form.role,
        office_level: form.office_level,
        province: form.province || null,
        municipality: form.municipality || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast(data.error ?? "Failed to update user.", "error"); return; }
    toast("User updated.", "success");
    closeModal();
    fetchUsers();
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    if (resetPassword.length < 8) { toast("Password must be at least 8 characters.", "error"); return; }
    setSaving(true);
    const res = await fetch(`/api/users/${selectedUser.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: resetPassword }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast(data.error ?? "Failed to reset password.", "error"); return; }
    toast("Password reset. User will be prompted to change it on next login.", "success");
    closeModal();
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error ?? "Failed to update user.", "error"); return; }
    toast(u.is_active ? "User deactivated." : "User activated.", u.is_active ? "warning" : "success");
    fetchUsers();
  }

  const f = (key: keyof FormState, val: string) => setForm((p) => ({ ...p, [key]: val }));

  return (
    <div className="page-enter">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[1.6rem] font-bold text-gray-900 leading-tight">User Management</h2>
          <p className="text-[12px] text-gray-400 mt-0.5 tracking-wide">
            Manage system accounts, roles, and access levels
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="7" y1="1" x2="7" y2="13" /><line x1="1" y1="7" x2="13" y2="7" />
          </svg>
          New User
        </button>
      </div>

      {/* Table */}
      <div className="card-bezel">
        <div className="card-bezel-inner">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading users…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-green-900 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Full Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Username</th>
                    <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Office Level</th>
                    <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Province / Municipality</th>
                    <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {u.full_name}
                        {u.must_change_password && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-600">
                            Temp PW
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500">{u.username}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${LEVEL_BADGE[u.office_level] ?? "bg-gray-100 text-gray-600"}`}>
                          {u.office_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-[12px]">
                        {[u.province, u.municipality].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(u)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openResetPassword(u)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                          >
                            Reset PW
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              u.is_active
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {(modalMode === "create" || modalMode === "edit") && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-green-900 px-6 py-4 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest">
                {modalMode === "create" ? "New User" : "Edit User"}
              </h3>
              <button onClick={closeModal} className="text-green-300 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input
                    value={form.full_name} onChange={(e) => f("full_name", e.target.value)}
                    placeholder="Juan Dela Cruz"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Username <span className="text-red-400">*</span></label>
                  <input
                    value={form.username} onChange={(e) => f("username", e.target.value)}
                    placeholder="jdelacruz" disabled={modalMode === "edit"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {modalMode === "create" && !generatedPassword && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400">
                        Password <span className="text-gray-300 normal-case tracking-normal font-normal">(optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => { const pw = generatePassword(); f("password", pw); setShowPassword(true); }}
                        className="text-[10px] font-semibold text-green-700 hover:text-green-900 uppercase tracking-widest flex items-center gap-1 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a5 5 0 0 1 0 10H2"/><polyline points="5 9 2 12 5 15"/>
                        </svg>
                        Generate
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.password} onChange={(e) => f("password", e.target.value)}
                        placeholder="Leave blank to auto-generate"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-14 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600"
                      />
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[11px]">
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                )}
                {generatedPassword && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                    <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-widest">User created — Temporary Password</p>
                    <p className="text-[11px] text-emerald-600">Share this password with the user. They will be asked to change it on first login.</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[14px] font-mono font-bold text-gray-800 tracking-widest select-all">
                        {generatedPassword}
                      </code>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(generatedPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="flex-shrink-0 px-3 py-2 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Role <span className="text-red-400">*</span></label>
                  <select value={form.role} onChange={(e) => f("role", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 bg-white">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Office Level <span className="text-red-400">*</span></label>
                  <select value={form.office_level} onChange={(e) => f("office_level", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 bg-white capitalize">
                    {OFFICE_LEVELS.filter((l) => isRegional || l !== "regional").map((l) => (
                      <option key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                    ))}
                  </select>
                </div>
                {form.office_level !== "regional" && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Province</label>
                    {isRegional ? (
                      <select value={form.province} onChange={(e) => f("province", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 bg-white">
                        <option value="">— Select Province —</option>
                        {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <input
                        value={form.province} readOnly disabled
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                    )}
                  </div>
                )}
                {form.office_level === "municipal" && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Municipality</label>
                    <input value={form.municipality} onChange={(e) => f("municipality", e.target.value)}
                      placeholder="e.g. Legazpi City"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600" />
                  </div>
                )}
              </div>
              {modalMode === "create" && !generatedPassword && (
                <p className="text-[11px] text-gray-400">
                  The user will be required to change their password on first login.
                </p>
              )}
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={closeModal} className="btn-ghost">
                {generatedPassword ? "Close" : "Cancel"}
              </button>
              {!generatedPassword && (
                <button onClick={modalMode === "create" ? handleCreate : handleEdit} disabled={saving} className="btn-primary">
                  {saving ? "Saving…" : modalMode === "create" ? "Create User" : "Save Changes"}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalMode === "reset_password" && selectedUser && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-amber-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest">Reset Password</h3>
              <button onClick={closeModal} className="text-amber-200 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[13px] text-gray-600">
                Set a temporary password for <span className="font-bold text-gray-800">{selectedUser.full_name}</span>.
                They will be required to change it on next login.
              </p>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400">New Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
                      const pw = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
                      setResetPassword(pw);
                      setShowPassword(true);
                    }}
                    className="text-[11px] text-amber-600 font-semibold hover:underline"
                  >
                    Generate random
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-9 text-[13px] focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button type="button" onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[11px]">
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={closeModal} className="btn-ghost">Cancel</button>
              <button onClick={handleResetPassword} disabled={saving}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
                {saving ? "Resetting…" : "Reset Password"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
