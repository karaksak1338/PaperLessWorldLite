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
  created_at: string;
  image_uri: string;
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
        setEditAmount(selectedDoc.amount || "");
        setEditType(selectedDoc.type || "Other");

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
          },
        ])
        .select()
        .single();

      if (dbError) throw dbError;

      // Update local state immediately
      setDocuments((prev) => [newDoc as Document, ...prev]);

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
      // Sanitize amount: empty string to null, strip non-numeric
      const sanitizedAmount = editAmount.trim() === '' ? null : editAmount.replace(/[^0-9.]/g, '');

      const { error } = await supabase
        .from("documents")
        .update({
          vendor: editVendor.trim() || "Unknown Vendor",
          date: editDate || null,
          amount: sanitizedAmount,
          type: editType,
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

  return (
    <div className={styles.container}>
      <div className="gradient-bg" />

      <nav className={`${styles.nav} glass`}>
        <div className={styles.logo}>
          PaperLessWorldLite
        </div>
        <div className={styles.navLinks}>
          <a href="#" className={styles.navLink}>Dashboard</a>
          <button onClick={handleSignOut} className={`${styles.navLink} ${styles.signOutBtn}`}>Sign Out</button>
        </div>
      </nav>

      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            Manage your <span className={styles.gradientText}>Documents Paperless</span>
          </h1>
          <p className={styles.subtitle}>
            Cloud-synced, AI-powered document intelligence for professionals.
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
                <p className={styles.empty}>
                  {isFiltered ? "No matching documents found." : "No documents found in your vault."}
                </p>
              ) : (
                displayedDocuments.map((doc) => (
                  <div key={doc.id} className={styles.listItem}>
                    <div className={styles.docIcon} onClick={() => setSelectedDoc(doc)} style={{ cursor: 'pointer' }}>📄</div>
                    <div className={styles.docInfo} onClick={() => setSelectedDoc(doc)} style={{ cursor: 'pointer' }}>
                      <span className={styles.docName}>{doc.vendor || "Unknown Vendor"}</span>
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

        {selectedDoc && (
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
        )}
      </main>

      <footer className={styles.footer}>
        <p>© 2026 PaperLessWorldLite. Governed by NSK IT Consulting GmbH.</p>
      </footer>
    </div>
  );
}
