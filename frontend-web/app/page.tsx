"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";
import { AuthService } from "@/lib/auth";

interface Document {
  id: string;
  vendor: string | null;
  amount: string | null;
  type: string;
  date: string | null;
  reminder_date: string | null;
  created_at: string;
  image_uri: string;
}

interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  company: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  subscription_state: 'ACTIVE' | 'PENDING_CHANGE' | 'CANCELLED' | 'EXPIRED';
  plan_id: string;
  subscription_plans?: {
    name: string;
    plan_code: string;
    monthly_limit: number;
  };
}

interface PlanRequest {
  id: string;
  user_id: string;
  request_type: 'UPGRADE' | 'DOWNGRADE' | 'CANCEL';
  requested_plan_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  requested_at: string;
  profiles: { username: string; full_name: string };
  requested_plan: { name: string };
}

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: any;
  new_data: any;
  performed_by: string;
  created_at: string;
}

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editVendor, setEditVendor] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState("");
  const [editReminderDate, setEditReminderDate] = useState("");

  // Filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Dynamic Categories
  const [documentTypes, setDocumentTypes] = useState<{ id: string, name: string, color: string }[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [displayLimit, setDisplayLimit] = useState(10);

  // Profile & Subscription state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<{ name: string, plan_code: string, monthly_limit: number } | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [subscriptionPlans, setSubscriptionPlans] = useState<{ id: string, name: string, plan_code: string, monthly_limit: number, price: number }[]>([]);

  // Admin Data
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [planRequests, setPlanRequests] = useState<PlanRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'USERS' | 'REQUESTS' | 'PLANS' | 'AUDIT'>('USERS');

  // Fetch Document Types
  const fetchTypes = async () => {
    const { data, error } = await supabase
      .from("document_types")
      .select("*")
      .order("name");
    if (!error) setDocumentTypes(data || []);
  };

  useEffect(() => {
    // 1. Initial fetch
    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) console.error("Error fetching documents:", error);
      else setDocuments(data || []);
      setLoading(false);
    };

    fetchDocs();

    fetchTypes();

    const fetchProfileData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch Profile
      let { data: profileData } = await supabase
        .from("profiles")
        .select("*, subscription_plans(name, plan_code, monthly_limit)")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setEditName(profileData.full_name || "");
        setEditUsername(profileData.username || "");
        setEditAddress(profileData.address || "");
        setSubscription(profileData.subscription_plans);

        // If Admin, fetch all data
        if (profileData.role === 'ADMIN') {
          fetchAdminData();
        }
      }

      // 2. Fetch Usage (Docs created this month)
      const { data: usageCount } = await supabase.rpc('get_monthly_usage', { target_user_id: user.id });
      setMonthlyUsage(usageCount || 0);

      // 3. Fetch all plans
      const { data: plans } = await supabase.from("subscription_plans").select("*").order("price");
      setSubscriptionPlans(plans || []);
    };

    const fetchAdminData = async () => {
      // Fetch Users
      const { data: users } = await supabase.from("profiles").select("*, subscription_plans(name, plan_code, monthly_limit)").order("full_name");
      setAllUsers(users || []);

      // Fetch Requests
      const { data: reqs } = await supabase
        .from("plan_change_requests")
        .select("*, profiles(username, full_name), requested_plan:subscription_plans!requested_plan_id(name)")
        .order("requested_at", { ascending: false });
      setPlanRequests(reqs || []);

      // Fetch Audits
      const { data: audits } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setAuditLogs(audits || []);
    };

    fetchProfileData();

    // 4. Real-time subscriptions
    const docsChannel = supabase
      .channel("documents_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setDocuments((prev) => [payload.new as Document, ...prev]);
          } else if (payload.eventType === "DELETE") {
            setDocuments((prev) => prev.filter((doc) => doc.id !== payload.old.id));
          } else if (payload.eventType === "UPDATE") {
            setDocuments((prev) =>
              prev.map((doc) => (doc.id === payload.new.id ? (payload.new as Document) : doc))
            );
          }
        }
      )
      .subscribe();

    const typesChannel = supabase
      .channel("types_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_types" },
        () => fetchTypes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(docsChannel);
      supabase.removeChannel(typesChannel);
    };
  }, []);

  // Fetch signed URL when document is selected
  useEffect(() => {
    if (selectedDoc) {
      const fetchSignedUrl = async () => {
        setSignedUrl(null); // Reset

        // Initialize edit states
        setEditVendor(selectedDoc.vendor || "");
        setEditDate(selectedDoc.date || "");
        setEditAmount(String(selectedDoc.amount || ""));
        setEditType(selectedDoc.type || "Other");
        setEditReminderDate(selectedDoc.reminder_date || "");

        // CLEANUP: Ensure path doesn't have leading slashes which can break URLs
        const cleanPath = selectedDoc.image_uri.replace(/^\/+/, "");

        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(cleanPath, 3600); // 1 hour

        if (error) {
          console.error("Error creating signed URL:", error);
          // Fallback to public URL if signed fails (for public debugging)
          const { data: publicData } = supabase.storage.from("documents").getPublicUrl(cleanPath);
          setSignedUrl(publicData.publicUrl);
        } else {
          setSignedUrl(data.signedUrl);
        }
      };
      fetchSignedUrl();
    }
  }, [selectedDoc]);

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = (doc.vendor || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(doc.amount || "").includes(searchQuery);
    const matchesType = typeFilter === "All" || doc.type === typeFilter;

    let matchesDate = true;
    if (doc.date) {
      if (startDate && doc.date < startDate) matchesDate = false;
      if (endDate && doc.date > endDate) matchesDate = false;
    } else if (startDate || endDate) {
      matchesDate = false; // No date on doc but filter active
    }

    return matchesSearch && matchesType && matchesDate;
  });

  // 10-item limit logic
  const isFiltered = searchQuery !== "" || typeFilter !== "All" || startDate !== "" || endDate !== "";
  const displayedDocuments = filteredDocuments.slice(0, displayLimit);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      // Check monthly limit
      if (subscription && subscription.monthly_limit !== -1 && monthlyUsage >= subscription.monthly_limit) {
        alert(`Monthly limit reached (${subscription.monthly_limit} docs). Please upgrade your plan.`);
        setUploading(false);
        return;
      }

      // 1. Upload to Storage
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 2. Call AI OCR Edge Function
      let ocrData = { vendor: "Manual Upload", date: new Date().toISOString().split('T')[0], amount: null, type: "Other" };
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke('process-document', {
          body: { imagePath: uploadData.path }
        });
        if (!aiError && aiData) {
          ocrData = aiData;
        } else {
          console.warn("AI Analysis failed, using fallback:", aiError);
        }
      } catch (e) {
        console.warn("AI Service unavailable, using fallback.");
      }

      // 3. Insert DB record
      const { data: newDoc, error: dbError } = await supabase
        .from("documents")
        .insert([
          {
            user_id: user.id,
            image_uri: uploadData.path,
            vendor: ocrData.vendor || "Manual Upload",
            date: ocrData.date || null,
            amount: ocrData.amount || null,
            type: ocrData.type || "Other",
            reminder_date: null,
          },
        ])
        .select()
        .single();

      if (dbError) throw dbError;

      // Update local state immediately
      setDocuments((prev) => [newDoc as Document, ...prev]);
      setMonthlyUsage(prev => prev + 1);

      alert("Document uploaded successfully! AI extraction complete.");
    } catch (error: any) {
      console.error("Full Upload Error:", error);
      const errorMessage = error.message || error.error || JSON.stringify(error) || "Unknown error occurred";
      alert("Upload failed: " + errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, imageUri: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      const { error: dbError } = await supabase.from("documents").delete().eq("id", id);
      if (dbError) throw dbError;

      // Update local state immediately
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));

      await supabase.storage.from("documents").remove([imageUri]);
    } catch (error: any) {
      alert("Delete failed: " + error.message);
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleUpdate = async () => {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      // Validate reminder date isn't in the past
      if (editReminderDate) {
        const today = new Date().toISOString().split('T')[0];
        if (editReminderDate < today) {
          alert("Reminder date cannot be in the past.");
          setSaving(false);
          return;
        }
      }

      // Sanitize amount: empty string to null, strip non-numeric
      const amountStr = String(editAmount || "");
      const sanitizedAmount = amountStr.trim() === '' ? null : amountStr.replace(/[^0-9.]/g, '');

      const { error } = await supabase
        .from("documents")
        .update({
          vendor: editVendor.trim() || "Unknown Vendor",
          date: editDate || null,
          amount: sanitizedAmount,
          type: editType,
          reminder_date: editReminderDate || null,
        })
        .eq("id", selectedDoc.id);

      if (error) throw error;

      // Update local state immediately for better UX
      const updatedDoc = {
        ...selectedDoc,
        vendor: editVendor.trim() || "Unknown Vendor",
        date: editDate || null,
        amount: sanitizedAmount,
        type: editType,
        reminder_date: editReminderDate || null,
      };

      setDocuments((prev) =>
        prev.map((doc) => (doc.id === selectedDoc.id ? updatedDoc : doc))
      );

      setSelectedDoc(null);
      alert("Document updated successfully!");
    } catch (error: any) {
      console.error("Update failed:", error);
      alert("Failed to update: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await AuthService.signOut();
    window.location.reload();
  };

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    const { error } = await supabase
      .from("document_types")
      .insert([{ name: newTypeName.trim() }]);
    if (error) {
      console.error("Error adding type:", error);
      alert("Error adding type: " + error.message);
    } else {
      setNewTypeName("");
      fetchTypes(); // Proactive update for snappiness
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm("Deleting this type won't delete documents, but they will lose their category label. Continue?")) return;
    const { error } = await supabase
      .from("document_types")
      .delete()
      .eq("id", id);
    if (error) alert("Error deleting type: " + error.message);
    else fetchTypes(); // Proactive update for snappiness
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Validate Username
      if (editUsername.trim() && editUsername !== profile?.username) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", editUsername.trim())
          .maybeSingle();

        if (existing) {
          alert("Error: USERNAME_ALREADY_EXISTS");
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          username: editUsername.trim() || null,
          full_name: editName,
          address: editAddress,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      alert("Profile updated successfully!");
      // Update local state
      if (profile) setProfile({ ...profile, username: editUsername.trim(), full_name: editName, address: editAddress });
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPlanChange = async (targetPlanId: string, type: 'UPGRADE' | 'DOWNGRADE' | 'CANCEL') => {
    if (!confirm(`Are you sure you want to request a ${type}?`)) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('request_plan_change', {
        target_plan_id: targetPlanId,
        type: type
      });

      if (error) {
        if (error.message.includes('CHANGE_ALREADY_PENDING')) alert("Error: CHANGE_ALREADY_PENDING");
        else if (error.message.includes('QUOTA_CONFLICT')) alert("Error: QUOTA_CONFLICT");
        else throw error;
      } else {
        alert("Request submitted! An administrator will review it shortly.");
        // Refresh profile state
        if (profile) setProfile({ ...profile, subscription_state: 'PENDING_CHANGE' });
      }
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleProcessRequest = async (requestId: string, approve: boolean) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const req = planRequests.find(r => r.id === requestId);
      if (!req) return;

      const newStatus = approve ? 'APPROVED' : 'REJECTED';

      const { error } = await supabase
        .from("plan_change_requests")
        .update({
          status: newStatus,
          processed_by: user.id,
          effective_at: approve ? new Date().toISOString() : null
        })
        .eq("id", requestId);

      if (error) throw error;

      // If approved, update user's plan and state
      if (approve) {
        await supabase
          .from("profiles")
          .update({
            plan_id: req.requested_plan_id,
            subscription_state: 'ACTIVE'
          })
          .eq("id", req.user_id);
      } else {
        // Just reset state
        await supabase
          .from("profiles")
          .update({ subscription_state: 'ACTIVE' })
          .eq("id", req.user_id);
      }

      alert(`Request ${newStatus}`);
      // Refresh local admin data
      const { data: users } = await supabase.from("profiles").select("*, subscription_plans(name, plan_code, monthly_limit)").order("full_name");
      setAllUsers(users || []);
      const { data: reqs } = await supabase
        .from("plan_change_requests")
        .select("*, profiles(username, full_name), requested_plan:subscription_plans!requested_plan_id(name)")
        .order("requested_at", { ascending: false });
      setPlanRequests(reqs || []);

    } catch (error: any) {
      alert("Error processing request: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePlan = async (planId: string, limit: number, price: number) => {
    const { error } = await supabase
      .from("subscription_plans")
      .update({ monthly_limit: limit, price: price, modified_at: new Date().toISOString() })
      .eq("id", planId);

    if (error) alert("Error updating plan: " + error.message);
    else {
      alert("Plan updated!");
      const { data } = await supabase.from("subscription_plans").select("*").order("price");
      setSubscriptionPlans(data || []);
    }
  };

  const handlePasswordReset = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) alert("Error: " + error.message);
    else alert("Password reset email sent to " + user.email);
  };

  return (
    <div className={styles.container}>
      <div className="gradient-bg" />

      <nav className={`${styles.nav} glass`}>
        <div className={styles.logo}>
          DocuVault<span className={styles.accent}> Pro</span>
        </div>
        <div className={styles.navLinks}>
          <button onClick={() => setShowProfile(true)} className={styles.navLink}>Profile</button>
          <button onClick={handleSignOut} className={`${styles.navLink} ${styles.signOutBtn}`}>Sign Out</button>
        </div>
      </nav>

      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            Your Secure <span className={styles.gradientText}>DocuVault Pro</span>
          </h1>
          <p className={styles.subtitle}>
            Professional cloud-synced document intelligence & secure vault.
          </p>
        </header>

        <div className={styles.dashboardGrid}>
          {/* Main Content Area */}
          <section className={styles.recentDocs}>
            <div className={`${styles.sectionHeader}`}>
              <div>
                <h2>Documents</h2>
              </div>
              <div className={styles.headerActions}>
                <div className={styles.searchContainer}>
                  <input
                    type="text"
                    placeholder="Search vendor or amount..."
                    className={styles.searchInput}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <select
                    className={styles.typeSelect}
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="All">All Types</option>
                    {documentTypes.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <div className={styles.dateFilter}>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={styles.dateInput}
                    />
                    <span>to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={styles.dateInput}
                    />
                  </div>
                </div>
                <input
                  type="file"
                  id="docUpload"
                  className={styles.uploadInput}
                  accept="image/*"
                  onChange={handleUpload}
                />
                <label htmlFor="docUpload" className={styles.uploadBtn}>
                  {uploading ? "Uploading..." : "Upload Document"}
                </label>
              </div>
            </div>

            <div className={`${styles.list} glass`}>
              {loading ? (
                <p className={styles.loading}>Syncing with Vault...</p>
              ) : displayedDocuments.length === 0 ? (
                <div className={styles.zeroState}>
                  <div className={styles.zeroIcon}>📁</div>
                  <h3>{isFiltered ? "No matching scans" : "Your Vault is Empty"}</h3>
                  <p>
                    {isFiltered
                      ? "Try adjusting your filters to find what you're looking for."
                      : "Start your paperless journey by uploading your first document."}
                  </p>
                  {!isFiltered && (
                    <label htmlFor="docUpload" className={styles.miniUploadBtn}>
                      Add First Document
                    </label>
                  )}
                </div>
              ) : (
                displayedDocuments.map((doc) => (
                  <div key={doc.id} className={styles.listItem}>
                    <div className={styles.docIcon} onClick={() => setSelectedDoc(doc)} style={{ cursor: 'pointer' }}>📄</div>
                    <div className={styles.docInfo} onClick={() => setSelectedDoc(doc)} style={{ cursor: 'pointer' }}>
                      <span className={styles.docName}>
                        {doc.vendor || "Unknown Vendor"}
                        {doc.reminder_date && <span className={styles.reminderIcon}> 🔔</span>}
                      </span>
                      <span className={styles.docMeta}>{doc.type} • {doc.date || "No date"}</span>
                    </div>
                    <div className={styles.docAmount}>{doc.amount ? `$${doc.amount}` : "-"}</div>
                    <button onClick={() => handleDelete(doc.id, doc.image_uri)} className={styles.deleteBtn}>🗑️</button>
                  </div>
                ))
              )}
              {filteredDocuments.length > displayLimit && (
                <div className={styles.loadMoreContainer}>
                  <button
                    onClick={() => setDisplayLimit(prev => prev + 10)}
                    className={styles.loadMoreBtn}
                  >
                    Load More Documents
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Right Sidebar Stats */}
          <aside className={styles.sidebar}>
            <section className={styles.statsColumn}>
              <div className={`${styles.statCard} glass`}>
                <h3>Filtered Results</h3>
                <p className={styles.statValue}>
                  {displayedDocuments.length === filteredDocuments.length
                    ? filteredDocuments.length
                    : `${displayedDocuments.length}/${filteredDocuments.length}`}
                </p>
                <span className={styles.statLabel}>Currently Showing</span>
              </div>
              <div className={`${styles.statCard} glass`}>
                <h3>AI Extractions</h3>
                <p className={styles.statValue}>{filteredDocuments.filter(d => d.amount).length}</p>
                <span className={styles.statLabel}>In Current View</span>
              </div>
              <div className={`${styles.statCard} glass`}>
                <h3>Vault Sync</h3>
                <p className={styles.statValue}>Active</p>
                <span className={styles.statLabel}>Connected</span>
              </div>

              <button
                className={`${styles.uploadBtn} ${styles.adminBtn}`}
                onClick={() => setShowAdmin(!showAdmin)}
              >
                Manage Labels & Types
              </button>

              {showAdmin && (
                <div className={`${styles.adminPanel} glass`}>
                  <h4>Document Types</h4>
                  <div className={styles.typeCreator}>
                    <input
                      type="text"
                      placeholder="New Label..."
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                    />
                    <button onClick={handleAddType}>Add</button>
                  </div>
                  <div className={styles.typeList}>
                    {documentTypes.map(t => (
                      <div key={t.id} className={styles.typeTag}>
                        <span>{t.name}</span>
                        <button onClick={() => handleDeleteType(t.id)}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>

        {showProfile && (
          <div className={styles.modalOverlay} onClick={() => setShowProfile(false)}>
            <div className={`${styles.modalContent} glass`} onClick={e => e.stopPropagation()}>
              <button className={styles.closeBtn} onClick={() => setShowProfile(false)}>✕</button>
              <h2>Account Settings</h2>

              <div className={styles.profileSection}>
                <div className={styles.planBadge}>
                  Plan: <strong>{subscription?.name || "Free"}</strong> ({monthlyUsage} / {subscription?.monthly_limit === -1 ? '∞' : subscription?.monthly_limit} docs used this month)
                </div>

                <form onSubmit={handleUpdateProfile} className={styles.profileForm}>
                  <div className={styles.formGroup}>
                    <label>Username (Unique)</label>
                    <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="@username" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Full Name</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Address</label>
                    <textarea value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Mailing address" rows={3} />
                  </div>
                  <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? "Saving..." : "Save Profile Details"}
                  </button>
                </form>

                <div className={styles.securitySection}>
                  <h3>Subscription & Quota</h3>
                  <div className={styles.planBadge}>
                    Current Plan: <strong>{subscription?.name || "Free"}</strong> ({monthlyUsage} / {subscription?.monthly_limit === -1 ? '∞' : subscription?.monthly_limit} docs)
                    {profile?.subscription_state === 'PENDING_CHANGE' && (
                      <div className={styles.pendingHint}>🔔 Change Request Pending Admin Review</div>
                    )}
                  </div>

                  {profile?.subscription_state === 'ACTIVE' && (
                    <div className={styles.planSelector}>
                      <label>Request Plan Change:</label>
                      <div className={styles.planGrid}>
                        {subscriptionPlans.filter(p => p.id !== profile.plan_id).map(p => (
                          <div key={p.id} className={styles.planOption}>
                            <span>{p.name} ($0.00)</span>
                            <button
                              onClick={() => handleRequestPlanChange(p.id, p.monthly_limit > (subscription?.monthly_limit || 0) ? 'UPGRADE' : 'DOWNGRADE')}
                              className={styles.miniBtn}
                            >
                              Request
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <hr className={styles.divider} />

                <div className={styles.securitySection}>
                  <h3>Security</h3>
                  <p className={styles.hint}>Need to change your password? We'll send instructions to your email.</p>
                  <button onClick={handlePasswordReset} className={styles.secondaryBtn}>Send Reset Email</button>
                </div>

                <hr className={styles.divider} />

                {profile?.role === 'ADMIN' && (
                  <>
                    <hr className={styles.divider} />
                    <div className={styles.adminTrigger}>
                      <button
                        className={styles.plainLink}
                        onClick={() => setShowAdminDashboard(!showAdminDashboard)}
                      >
                        {showAdminDashboard ? "Hide Management Dashboard" : "Open Admin Control Plane"}
                      </button>
                    </div>
                  </>
                )}

                {showAdminDashboard && (
                  <div className={styles.planAdminTable}>
                    <div className={styles.tabHeader}>
                      <button className={activeTab === 'USERS' ? styles.activeTab : ''} onClick={() => setActiveTab('USERS')}>Users</button>
                      <button className={activeTab === 'REQUESTS' ? styles.activeTab : ''} onClick={() => setActiveTab('REQUESTS')}>Requests</button>
                      <button className={activeTab === 'PLANS' ? styles.activeTab : ''} onClick={() => setActiveTab('PLANS')}>Plans</button>
                      <button className={activeTab === 'AUDIT' ? styles.activeTab : ''} onClick={() => setActiveTab('AUDIT')}>Audit Log</button>
                    </div>

                    {activeTab === 'USERS' && (
                      <div className={styles.adminTabContent}>
                        <h3>User Administration</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>User/Username</th>
                              <th>Status</th>
                              <th>Plan</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allUsers.map(u => (
                              <tr key={u.id}>
                                <td>
                                  <div>{u.full_name || 'No Name'}</div>
                                  <div className={styles.hint}>@{u.username || 'no-username'}</div>
                                </td>
                                <td>
                                  <span className={`${styles.statusBadge} ${styles[u.status.toLowerCase()]}`}>
                                    {u.status}
                                  </span>
                                </td>
                                <td>{u.subscription_plans?.name}</td>
                                <td>
                                  <button onClick={() => alert("Suspend flow TBD")}>Manage</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeTab === 'REQUESTS' && (
                      <div className={styles.adminTabContent}>
                        <h3>Plan Change Requests</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>User</th>
                              <th>Type</th>
                              <th>Plan</th>
                              <th>Date</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {planRequests.map(r => (
                              <tr key={r.id}>
                                <td>{r.profiles.username || r.profiles.full_name}</td>
                                <td><strong>{r.request_type}</strong></td>
                                <td>{r.requested_plan.name}</td>
                                <td>{new Date(r.requested_at).toLocaleDateString()}</td>
                                <td>
                                  {r.status === 'PENDING' ? (
                                    <div className={styles.btnGroup}>
                                      <button className={styles.approveBtn} onClick={() => handleProcessRequest(r.id, true)}>Approve</button>
                                      <button className={styles.rejectBtn} onClick={() => handleProcessRequest(r.id, false)}>Reject</button>
                                    </div>
                                  ) : (
                                    <span className={`${styles.statusBadge} ${styles[r.status.toLowerCase()]}`}>
                                      {r.status}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeTab === 'PLANS' && (
                      <div className={styles.adminTabContent}>
                        <h3>Manage Subscription Tiers</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Plan Code</th>
                              <th>Limit</th>
                              <th>Price</th>
                              <th>Sync</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subscriptionPlans.map(plan => (
                              <tr key={plan.id}>
                                <td><strong>{plan.plan_code}</strong></td>
                                <td>
                                  <input
                                    type="number"
                                    defaultValue={plan.monthly_limit}
                                    onBlur={(e) => plan.monthly_limit = parseInt(e.target.value)}
                                  />
                                </td>
                                <td>${plan.price}</td>
                                <td>
                                  <button onClick={() => handleUpdatePlan(plan.id, plan.monthly_limit, plan.price)}>Update</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeTab === 'AUDIT' && (
                      <div className={styles.adminTabContent}>
                        <h3>System Audit Trail</h3>
                        <div className={styles.auditContainer}>
                          {auditLogs.map(log => (
                            <div key={log.id} className={styles.auditItem}>
                              <div className={styles.auditMeta}>
                                <span className={styles.auditAction}>{log.action}</span>
                                <span className={styles.auditTable}>{log.table_name}</span>
                                <span className={styles.auditTime}>{new Date(log.created_at).toLocaleString()}</span>
                              </div>
                              <div className={styles.auditDetails}>
                                Record ID: <span className={styles.mono}>{log.record_id}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
        }

        {
          selectedDoc && (
            <div className={styles.modalOverlay} onClick={() => setSelectedDoc(null)}>
              <div className={`${styles.modalContent} glass`} onClick={e => e.stopPropagation()}>
                <button className={styles.closeBtn} onClick={() => setSelectedDoc(null)}>✕</button>
                <h2>Document Details</h2>
                <div className={styles.modalGrid}>
                  <div className={styles.imagePreview}>
                    {signedUrl ? (
                      signedUrl.toLowerCase().includes(".pdf") ? (
                        <iframe src={signedUrl} className={styles.pdfIframe} />
                      ) : (
                        <img src={signedUrl} alt="Document" onError={(e) => {
                          console.error("Image load failed, attempting recovery...");
                          // If it fails, maybe it's not an image or CORS issue
                        }} />
                      )
                    ) : (
                      <div className={styles.loaderContainer}>
                        <div className={styles.loader} />
                        <p>Fetching secure preview...</p>
                      </div>
                    )}
                  </div>
                  <div className={styles.details}>
                    <div className={styles.detailItem}>
                      <label>Vendor</label>
                      <input
                        type="text"
                        value={editVendor}
                        onChange={(e) => setEditVendor(e.target.value)}
                        className={styles.modalInput}
                      />
                    </div>
                    <div className={styles.detailItem}>
                      <label>Date</label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className={styles.modalInput}
                      />
                    </div>
                    <div className={styles.detailItem}>
                      <label>Amount</label>
                      <input
                        type="text"
                        placeholder="0.00"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className={styles.modalInput}
                      />
                    </div>
                    <div className={styles.detailItem}>
                      <label>Classification</label>
                      <select
                        className={styles.modalInput}
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                      >
                        <option value="Other">Other</option>
                        {documentTypes.map(t => (
                          <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.detailItem}>
                      <label>Reminder Date</label>
                      <input
                        type="date"
                        value={editReminderDate}
                        onChange={(e) => setEditReminderDate(e.target.value)}
                        className={styles.modalInput}
                      />
                    </div>
                    <button
                      onClick={handleUpdate}
                      className={styles.saveBtn}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }
      </main >

      <footer className={styles.footer}>
        <p>© 2026 PaperLessWorldLite. Governed by NSK IT Consulting GmbH.</p>
      </footer>
    </div >
  );
}
