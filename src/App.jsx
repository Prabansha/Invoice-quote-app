import { useState, useEffect, useRef, useMemo } from "react";
import { storage } from "./storage";

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap";

const TEMPLATES = [
  { id: "harbor", name: "Harbor", blurb: "Solid header block, tinted to your logo" },
  { id: "ledger", name: "Ledger", blurb: "Clean ruled lines, minimal ink" },
  { id: "brass", name: "Brass", blurb: "Dark block, accent bar tinted to your logo" },
];

const CURRENCIES = ["LKR", "USD", "EUR", "GBP", "INR"];
const DEFAULT_ACCENT = "#16323F";

const emptyItem = () => ({ id: crypto.randomUUID(), desc: "", qty: 1, warranty: "", amount: 0 });

const defaultBiz = {
  name: "Your Business Name",
  tagline: "Tagline or service line",
  address: "No 12, Main Street, Negombo",
  phone: "+94 77 123 4567",
  email: "hello@business.lk",
  website: "www.business.lk",
  regNo: "",
  logo: null,
};

const defaultBank = { bankName: "", accountName: "", accountNumber: "", branch: "" };
const defaultTerms = "Payment due within 14 days of the invoice date. Prices are valid as quoted and subject to change thereafter. Goods/services once delivered are as per the agreed scope.";

function fmt(n, cur) {
  const v = isFinite(n) ? n : 0;
  return `${cur} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function shade(hex, percent) {
  const h = (hex || DEFAULT_ACCENT).replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return rgbToHex(r * (1 - percent), g * (1 - percent), b * (1 - percent));
}

function getContrastText(hex) {
  if (!hex) return "#ffffff";
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1B1B1B" : "#ffffff";
}

// Removes a solid/near-solid background from a logo image (flood fill from the
// edges) and picks a saturated accent color from what's left, for theming.
async function processLogoFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const maxDim = 500;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const idx = (x, y) => (y * w + x) * 4;

  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let br = 0, bg = 0, bb = 0;
  corners.forEach(([x, y]) => {
    const i = idx(x, y);
    br += data[i]; bg += data[i + 1]; bb += data[i + 2];
  });
  br /= 4; bg /= 4; bb /= 4;

  const threshold = 46;
  const dist = (i) => {
    const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }

  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (dist(i) > threshold) continue;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  const buckets = {};
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lightness = (max + min) / 2 / 255;
    if (sat < 0.18 || lightness > 0.92 || lightness < 0.08) continue;
    const key = `${Math.round(r / 16)}-${Math.round(g / 16)}-${Math.round(b / 16)}`;
    if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
    buckets[key].r += r; buckets[key].g += g; buckets[key].b += b; buckets[key].count++;
  }
  let best = null;
  Object.values(buckets).forEach((b) => { if (!best || b.count > best.count) best = b; });
  const accentColor = best
    ? rgbToHex(Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count))
    : DEFAULT_ACCENT;

  ctx.putImageData(imageData, 0, 0);
  return { logo: canvas.toDataURL("image/png"), accentColor };
}

export default function InvoiceApp() {
  const [biz, setBiz] = useState(defaultBiz);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [autoAccent, setAutoAccent] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [template, setTemplate] = useState("harbor");
  const [docType, setDocType] = useState("Invoice");
  const [docNumber, setDocNumber] = useState("INV-0001");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [client, setClient] = useState({ name: "", address: "", email: "" });
  const [items, setItems] = useState([emptyItem(), emptyItem()]);
  const [taxPct, setTaxPct] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes] = useState("Thank you for your business.");
  const [terms, setTerms] = useState(defaultTerms);
  const [bank, setBank] = useState(defaultBank);
  const [saveState, setSaveState] = useState("idle");
  const [downloadState, setDownloadState] = useState("idle");
  const fileRef = useRef(null);
  const sheetRef = useRef(null);
  const styleRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("business-profile");
        if (res?.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.biz) setBiz((b) => ({ ...b, ...parsed.biz }));
          if (parsed.accentColor) setAccentColor(parsed.accentColor);
          if (typeof parsed.autoAccent === "boolean") setAutoAccent(parsed.autoAccent);
          if (parsed.bank) setBank((b) => ({ ...b, ...parsed.bank }));
          if (parsed.terms) setTerms(parsed.terms);
        }
      } catch (e) {
        // no saved profile yet
      }
    })();
  }, []);

  const persistBiz = async () => {
    setSaveState("saving");
    try {
      await storage.set("business-profile", JSON.stringify({ biz, accentColor, autoAccent, bank, terms }));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1400);
    } catch (e) {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 1800);
    }
  };

  const updateBiz = (patch) => setBiz((b) => ({ ...b, ...patch }));
  const updateBank = (patch) => setBank((b) => ({ ...b, ...patch }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Logo too large — please use an image under 5MB.");
      return;
    }
    setProcessing(true);
    try {
      const { logo, accentColor: detected } = await processLogoFile(file);
      updateBiz({ logo });
      setAccentColor(detected);
      setAutoAccent(true);
    } catch (err) {
      alert("Couldn't process that image — try a different file.");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateItem = (id, patch) =>
    setItems((its) => its.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems((its) => (its.length > 1 ? its.filter((it) => it.id !== id) : its));
  const addItem = () => setItems((its) => [...its, emptyItem()]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    [items]
  );
  const discountAmt = subtotal * ((Number(discountPct) || 0) / 100);
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((Number(taxPct) || 0) / 100);
  const total = taxable + taxAmt;

  const handlePrint = () => {
    try { window.print(); } catch (e) { downloadStandaloneHTML(); }
  };

  // Builds a standalone HTML file (styles + rendered markup, logo embedded as
  // a data URL already) so the person can open it in a normal browser tab and
  // use the browser's own "Print > Save as PDF" — this works even when the
  // print dialog can't be triggered from inside the embedded preview.
  const downloadStandaloneHTML = () => {
    if (!sheetRef.current || !styleRef.current) return;
    setDownloadState("working");
    try {
      const css = styleRef.current.innerHTML;
      const sheetHtml = sheetRef.current.innerHTML;
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${docType} ${docNumber}</title>
<style>${css}
  body { background: #FAF6EC; margin: 0; padding: 28px; display: flex; justify-content: center; }
  @media print { body { padding: 0; background: white; } }
</style>
</head>
<body>${sheetHtml}</body>
</html>`;
      const blob = new Blob([fullHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docType}-${docNumber || "document"}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadState("done");
      setTimeout(() => setDownloadState("idle"), 1800);
    } catch (e) {
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 1800);
    }
  };

  return (
    <div className="app-root">
      <style ref={styleRef}>{`
        @import url('${FONT_LINK}');
        :root {
          --navy: #16323F;
          --navy-2: #1F4657;
          --cream: #FAF6EC;
          --paper: #FFFFFF;
          --ink: #212A2E;
          --slate: #6E6E6E;
          --line: #E3DDCB;
          --danger: #B5432E;
        }
        * { box-sizing: border-box; }
        .app-root {
          font-family: 'Inter', sans-serif;
          background: var(--cream);
          color: var(--ink);
          min-height: 100%;
          padding: 0;
        }
        .shell {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 0;
          min-height: 100vh;
        }
        @media (max-width: 900px) {
          .shell { grid-template-columns: 1fr; }
        }
        .panel {
          background: var(--paper);
          border-right: 1px solid var(--line);
          padding: 24px 22px 60px;
          overflow-y: auto;
        }
        .preview-wrap {
          padding: 32px 28px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .brand-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 18px;
        }
        .brand-row h1 {
          font-family: 'Fraunces', serif;
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .save-pill { font-size: 11px; color: var(--slate); }
        .save-pill.saved { color: #2F7A4D; }
        .save-pill.error { color: var(--danger); }
        .section { margin-bottom: 22px; }
        .section-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--slate);
          font-weight: 600;
          margin-bottom: 10px;
          display: block;
        }
        .field { margin-bottom: 10px; }
        .field label { display: block; font-size: 12px; color: var(--slate); margin-bottom: 4px; }
        .field input, .field textarea, .field select {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 13px;
          font-family: inherit;
          background: var(--paper);
          color: var(--ink);
        }
        .field input:focus, .field textarea:focus, .field select:focus {
          outline: 2px solid var(--navy-2);
          outline-offset: 1px;
        }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .logo-box { display: flex; align-items: center; gap: 12px; }
        .logo-preview {
          width: 56px;
          height: 56px;
          border: 1px dashed var(--line);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          background-image:
            linear-gradient(45deg, #eee 25%, transparent 25%),
            linear-gradient(-45deg, #eee 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #eee 75%),
            linear-gradient(-45deg, transparent 75%, #eee 75%);
          background-size: 10px 10px;
          background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
        }
        .logo-preview img { width: 100%; height: 100%; object-fit: contain; }
        .btn {
          border: 1px solid var(--line);
          background: var(--paper);
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 12.5px;
          cursor: pointer;
          font-family: inherit;
          color: var(--ink);
        }
        .btn:hover { border-color: var(--navy-2); }
        .btn:disabled { opacity: 0.5; cursor: default; }
        .btn-primary { background: var(--navy); color: white; border-color: var(--navy); font-weight: 600; }
        .btn-primary:hover { background: var(--navy-2); }
        .toggle-row { display: flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
        .toggle-row button {
          flex: 1; padding: 8px; border: none; background: var(--paper);
          font-size: 12.5px; font-weight: 600; cursor: pointer; color: var(--slate);
        }
        .toggle-row button.active { background: var(--navy); color: white; }
        .template-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .template-opt {
          border: 1.5px solid var(--line); border-radius: 8px; padding: 10px 12px;
          cursor: pointer; display: flex; justify-content: space-between; align-items: center;
        }
        .template-opt.active { border-color: var(--navy-2); background: #F2F6F5; }
        .template-opt strong { font-size: 13px; display: block; }
        .template-opt span { font-size: 11px; color: var(--slate); }
        .swatch { width: 26px; height: 26px; border-radius: 5px; flex-shrink: 0; }
        .accent-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
        .accent-row input[type=color] {
          width: 34px; height: 34px; padding: 0; border: 1px solid var(--line);
          border-radius: 7px; cursor: pointer; background: none;
        }
        .accent-note { font-size: 11.5px; color: var(--slate); flex: 1; }
        .link-btn { background: none; border: none; color: var(--navy-2); font-size: 11.5px; cursor: pointer; font-weight: 600; padding: 0; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .items-table th {
          font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
          color: var(--slate); text-align: left; padding: 0 4px 6px; font-weight: 600;
        }
        .items-table td { padding: 3px; vertical-align: top; }
        .items-table input { padding: 6px 7px; font-size: 12.5px; }
        .item-remove { background: none; border: none; color: var(--slate); cursor: pointer; font-size: 15px; padding: 4px 6px; }
        .item-remove:hover { color: var(--danger); }
        .add-item-btn { font-size: 12px; color: var(--navy-2); background: none; border: none; cursor: pointer; font-weight: 600; padding: 4px 0; }
        .totals-mini { font-size: 12.5px; color: var(--slate); margin-top: 6px; }
        .actions { display: flex; gap: 8px; margin-top: 26px; }

        /* PREVIEW */
        .sheet {
          width: 720px; max-width: 100%; background: var(--paper);
          box-shadow: 0 8px 30px rgba(20,30,35,0.12); min-height: 960px;
          font-family: 'Inter', sans-serif; color: var(--ink);
        }
        .sheet-inner { padding: 46px 50px 50px; }
        .doc-title { font-family: 'Fraunces', serif; font-weight: 700; letter-spacing: 0.02em; }
        .meta-table { width: 100%; font-size: 12.5px; }
        .meta-table td { padding: 2px 0; }
        .items-preview { width: 100%; border-collapse: collapse; margin: 26px 0; }
        .items-preview th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 6px; color: var(--slate); }
        .items-preview td { padding: 9px 6px; font-size: 13px; vertical-align: middle; }
        .items-preview .num { text-align: right; }
        .totals-box { width: 260px; margin-left: auto; font-size: 13px; }
        .totals-box .line { display: flex; justify-content: space-between; padding: 5px 0; }
        .totals-box .grand { font-weight: 700; font-size: 15.5px; border-top: 2px solid var(--ink); margin-top: 6px; padding-top: 10px; }
        .logo-area { max-width: 170px; max-height: 120px; width: auto; height: auto; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.28)); }
        .foot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
        .foot-box h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--slate); margin: 0 0 8px; font-weight: 600; }
        .foot-box p { font-size: 12px; line-height: 1.65; margin: 0; color: var(--ink); }
        .bank-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; border-bottom: 1px dotted var(--line); }
        .bank-row span:first-child { color: var(--slate); }
        .notes-block { margin-top: 26px; font-size: 12px; color: var(--slate); border-top: 1px solid var(--line); padding-top: 14px; }
        .sig-row { margin-top: 54px; display: flex; justify-content: space-between; align-items: flex-end; }

        @media print {
          @page { size: A4; margin: 9mm; }
          .panel, .no-print { display: none !important; }
          .preview-wrap { padding: 0; display: block; }
          .shell { display: block; }
          .sheet { box-shadow: none; width: 100%; min-height: auto; }
          .sheet-inner { padding: 18px 32px 24px; }
          .doc-band { padding: 20px 32px !important; }
          .items-preview { margin: 12px 0; }
          .items-preview td, .items-preview th { padding: 6px; }
          .foot-grid { margin-top: 10px; }
          .notes-block { margin-top: 8px; padding-top: 6px; }
          .sig-row { margin-top: 18px; }
          .foot-grid, .totals-box, .sig-row, .items-preview { page-break-inside: avoid; }
        }
      `}</style>

      <div className="shell">
        {/* LEFT PANEL */}
        <div className="panel no-print">
          <div className="brand-row">
            <h1>Invoice &amp; Quote</h1>
            <span className={`save-pill ${saveState}`}>
              {saveState === "saving" && "saving…"}
              {saveState === "saved" && "profile saved"}
              {saveState === "error" && "save failed"}
            </span>
          </div>

          <div className="section">
            <span className="section-label">Business Profile</span>
            <div className="logo-box" style={{ marginBottom: 10 }}>
              <div className="logo-preview">
                {processing ? (
                  <span style={{ fontSize: 10, color: "var(--slate)" }}>working…</span>
                ) : biz.logo ? (
                  <img src={biz.logo} alt="Logo" />
                ) : (
                  <span style={{ fontSize: 10, color: "var(--slate)" }}>No logo</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button className="btn" onClick={() => fileRef.current?.click()} disabled={processing}>
                  {biz.logo ? "Replace logo" : "Upload logo"}
                </button>
                {biz.logo && <button className="btn" onClick={() => updateBiz({ logo: null })}>Remove</button>}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
              </div>
            </div>
            <div className="accent-row">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => { setAccentColor(e.target.value); setAutoAccent(false); }}
              />
              <span className="accent-note">
                {autoAccent && biz.logo ? "Header color auto-matched to your logo" : "Header color"}
              </span>
              {!autoAccent && biz.logo && (
                <button className="link-btn" onClick={async () => {
                  setProcessing(true);
                  try {
                    const res = await fetch(biz.logo);
                    const blob = await res.blob();
                    const { accentColor: detected } = await processLogoFile(blob);
                    setAccentColor(detected);
                    setAutoAccent(true);
                  } finally { setProcessing(false); }
                }}>Reset to auto</button>
              )}
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Business name</label>
              <input value={biz.name} onChange={(e) => updateBiz({ name: e.target.value })} />
            </div>
            <div className="field">
              <label>Tagline</label>
              <input value={biz.tagline} onChange={(e) => updateBiz({ tagline: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <textarea rows={2} value={biz.address} onChange={(e) => updateBiz({ address: e.target.value })} />
            </div>
            <div className="row2">
              <div className="field">
                <label>Phone</label>
                <input value={biz.phone} onChange={(e) => updateBiz({ phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={biz.email} onChange={(e) => updateBiz({ email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Website</label>
              <input value={biz.website} onChange={(e) => updateBiz({ website: e.target.value })} placeholder="www.yourbusiness.com" />
            </div>
            <div className="field">
              <label>Business Reg. / VAT No. (optional)</label>
              <input value={biz.regNo} onChange={(e) => updateBiz({ regNo: e.target.value })} placeholder="e.g. PV 12345 or VAT 123456789" />
            </div>
            <button className="btn" onClick={persistBiz}>Save profile for next time</button>
          </div>

          <div className="section">
            <span className="section-label">Document Type</span>
            <div className="toggle-row">
              <button className={docType === "Invoice" ? "active" : ""} onClick={() => setDocType("Invoice")}>Invoice</button>
              <button className={docType === "Quotation" ? "active" : ""} onClick={() => setDocType("Quotation")}>Quotation</button>
            </div>
          </div>

          <div className="section">
            <span className="section-label">Template</span>
            <div className="template-grid">
              {TEMPLATES.map((t) => (
                <div key={t.id} className={`template-opt ${template === t.id ? "active" : ""}`} onClick={() => setTemplate(t.id)}>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.blurb}</span>
                  </div>
                  <div className="swatch" style={{ background: t.id === "brass" ? "#1B1B1B" : accentColor }} />
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <span className="section-label">Document Details</span>
            <div className="row2">
              <div className="field">
                <label>Number</label>
                <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
              </div>
              <div className="field">
                <label>Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>{docType === "Invoice" ? "Due date" : "Valid until"}</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="section">
            <span className="section-label">Client</span>
            <div className="field">
              <label>Client name</label>
              <input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <textarea rows={2} value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
            </div>
          </div>

          <div className="section">
            <span className="section-label">Line Items</span>
            <table className="items-table">
              <thead>
                <tr><th style={{ width: "40%" }}>Description</th><th>Qty</th><th>Warranty</th><th>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td><input value={it.desc} onChange={(e) => updateItem(it.id, { desc: e.target.value })} placeholder="Item / service" /></td>
                    <td><input type="number" min="0" value={it.qty} onChange={(e) => updateItem(it.id, { qty: e.target.value })} style={{ width: 48 }} /></td>
                    <td><input value={it.warranty} onChange={(e) => updateItem(it.id, { warranty: e.target.value })} placeholder="e.g. 1 Year" style={{ width: 78 }} /></td>
                    <td><input type="number" min="0" value={it.amount} onChange={(e) => updateItem(it.id, { amount: e.target.value })} style={{ width: 74 }} /></td>
                    <td><button className="item-remove" onClick={() => removeItem(it.id)} aria-label="Remove item">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-item-btn" onClick={addItem}>+ Add line item</button>

            <div className="row2" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Discount %</label>
                <input type="number" min="0" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
              </div>
              <div className="field">
                <label>Tax %</label>
                <input type="number" min="0" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
              </div>
            </div>
            <div className="totals-mini">Subtotal {fmt(subtotal, currency)} · Total {fmt(total, currency)}</div>
          </div>

          <div className="section">
            <span className="section-label">Payment Details</span>
            <div className="field">
              <label>Bank name</label>
              <input value={bank.bankName} onChange={(e) => updateBank({ bankName: e.target.value })} placeholder="e.g. Commercial Bank" />
            </div>
            <div className="field">
              <label>Account name</label>
              <input value={bank.accountName} onChange={(e) => updateBank({ accountName: e.target.value })} />
            </div>
            <div className="row2">
              <div className="field">
                <label>Account number</label>
                <input value={bank.accountNumber} onChange={(e) => updateBank({ accountNumber: e.target.value })} />
              </div>
              <div className="field">
                <label>Branch</label>
                <input value={bank.branch} onChange={(e) => updateBank({ branch: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="section">
            <span className="section-label">Terms &amp; Conditions</span>
            <textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>

          <div className="section">
            <span className="section-label">Notes</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <button className="btn btn-primary" onClick={handlePrint}>Print / Save as PDF</button>
            <button className="btn" onClick={downloadStandaloneHTML} disabled={downloadState === "working"}>
              {downloadState === "working" ? "Preparing…" : downloadState === "done" ? "Downloaded ✓" : "Download file (open → Print to PDF)"}
            </button>
            <span style={{ fontSize: 11, color: "var(--slate)", lineHeight: 1.5 }}>
              If the Print button doesn't open a dialog here, use Download — open the file in your browser and print it to PDF from there.
            </span>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="preview-wrap">
          <div ref={sheetRef}>
          <DocumentSheet
            template={template}
            biz={biz}
            accentColor={accentColor}
            docType={docType}
            docNumber={docNumber}
            date={date}
            dueDate={dueDate}
            client={client}
            items={items}
            currency={currency}
            subtotal={subtotal}
            discountPct={discountPct}
            discountAmt={discountAmt}
            taxPct={taxPct}
            taxAmt={taxAmt}
            total={total}
            notes={notes}
            terms={terms}
            bank={bank}
          />
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentSheet(props) {
  const { template, biz, accentColor, docType, docNumber } = props;
  const textOnAccent = getContrastText(accentColor);

  if (template === "harbor") {
    return (
      <div className="sheet">
        <div className="doc-band" style={{ background: accentColor, color: textOnAccent, padding: "34px 50px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {biz.logo && <img src={biz.logo} className="logo-area" alt="logo" />}
              <div>
                <div className="doc-title" style={{ fontSize: 22 }}>{biz.name}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{biz.tagline}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="doc-title" style={{ fontSize: 26 }}>{docType}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{docNumber}</div>
            </div>
          </div>
        </div>
        <div className="sheet-inner">
          <PreviewBody {...props} accent={accentColor} />
        </div>
      </div>
    );
  }

  if (template === "ledger") {
    return (
      <div className="sheet">
        <div className="sheet-inner">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${accentColor}`, paddingBottom: 18, marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {biz.logo && <img src={biz.logo} className="logo-area" alt="logo" />}
              <div>
                <div className="doc-title" style={{ fontSize: 19 }}>{biz.name}</div>
                <div style={{ fontSize: 12, color: "var(--slate)" }}>{biz.tagline}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="doc-title" style={{ fontSize: 22, color: accentColor }}>{docType.toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "var(--slate)" }}>{docNumber}</div>
            </div>
          </div>
          <PreviewBody {...props} accent={accentColor} />
        </div>
      </div>
    );
  }

  // brass — stays dark for contrast, but the accent bar and title pick up the logo color
  return (
    <div className="sheet">
      <div className="doc-band" style={{ background: "#1B1B1B", color: "white", padding: "40px 50px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {biz.logo ? <img src={biz.logo} className="logo-area" alt="logo" /> : <div className="doc-title" style={{ fontSize: 20 }}>{biz.name}</div>}
          <div style={{ textAlign: "right" }}>
            <div className="doc-title" style={{ fontSize: 28, color: accentColor, letterSpacing: "0.08em" }}>{docType.toUpperCase()}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{docNumber}</div>
          </div>
        </div>
      </div>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${accentColor}, ${shade(accentColor, 0.4)})` }} />
      <div className="sheet-inner" style={{ paddingTop: 30 }}>
        <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 22 }}>{biz.tagline}</div>
        <PreviewBody {...props} accent={accentColor} />
      </div>
    </div>
  );
}

function PreviewBody({ biz, date, dueDate, docType, client, items, currency, subtotal, discountPct, discountAmt, taxPct, taxAmt, total, notes, terms, bank, accent }) {
  const hasBank = bank.bankName || bank.accountName || bank.accountNumber || bank.branch;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--slate)", maxWidth: 260 }}>
          {biz.address}<br />{biz.phone}<br />{biz.email}
          {biz.website ? <><br />{biz.website}</> : null}
          {biz.regNo ? <><br />Reg No: {biz.regNo}</> : null}
        </div>
        <table className="meta-table" style={{ width: 220 }}>
          <tbody>
            <tr><td style={{ color: "var(--slate)" }}>Date</td><td style={{ textAlign: "right" }}>{date || "—"}</td></tr>
            <tr><td style={{ color: "var(--slate)" }}>{docType === "Invoice" ? "Due" : "Valid until"}</td><td style={{ textAlign: "right" }}>{dueDate || "—"}</td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 22, marginBottom: 4, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate)" }}>Billed to</div>
      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{client.name || "Client name"}</div>
      <div style={{ fontSize: 12.5, color: "var(--slate)", lineHeight: 1.6 }}>{client.address}{client.email ? <><br />{client.email}</> : null}</div>

      <table className="items-preview">
        <thead>
          <tr style={{ borderBottom: `2px solid ${accent}` }}>
            <th>Description</th><th className="num">Qty</th><th>Warranty</th><th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <td>{it.desc || "—"}</td>
              <td className="num">{it.qty}</td>
              <td>{it.warranty || "—"}</td>
              <td className="num">{fmt(Number(it.amount) || 0, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals-box">
        <div className="line"><span>Subtotal</span><span>{fmt(subtotal, currency)}</span></div>
        {Number(discountPct) > 0 && <div className="line"><span>Discount ({discountPct}%)</span><span>-{fmt(discountAmt, currency)}</span></div>}
        {Number(taxPct) > 0 && <div className="line"><span>Tax ({taxPct}%)</span><span>{fmt(taxAmt, currency)}</span></div>}
        <div className="line grand"><span>Total</span><span>{fmt(total, currency)}</span></div>
      </div>

      <div className="foot-grid">
        {hasBank && (
          <div className="foot-box">
            <h4>Payment Details</h4>
            {bank.bankName && <div className="bank-row"><span>Bank</span><span>{bank.bankName}</span></div>}
            {bank.accountName && <div className="bank-row"><span>Account name</span><span>{bank.accountName}</span></div>}
            {bank.accountNumber && <div className="bank-row"><span>Account no.</span><span>{bank.accountNumber}</span></div>}
            {bank.branch && <div className="bank-row"><span>Branch</span><span>{bank.branch}</span></div>}
          </div>
        )}
        {terms && (
          <div className="foot-box">
            <h4>Terms &amp; Conditions</h4>
            <p>{terms}</p>
          </div>
        )}
      </div>

      {notes && (
        <div className="notes-block">
          {notes}
        </div>
      )}

      <div className="sig-row">
        <div style={{ width: 180 }}>
          <div style={{ borderTop: "1px solid var(--ink)", paddingTop: 6 }} />
          <div style={{ fontSize: 11, color: "var(--slate)", letterSpacing: "0.04em" }}>Date</div>
        </div>
        <div style={{ width: 220, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 28 }}>For {biz.name}</div>
          <div style={{ borderTop: "1px solid var(--ink)", paddingTop: 6 }} />
          <div style={{ fontSize: 11, color: "var(--slate)", letterSpacing: "0.04em" }}>Authorized Signature</div>
        </div>
      </div>
    </>
  );
}
