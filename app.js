/* =====================================================================
   Canyon Club Pool — Chore Tracker
   app.js  (ES module — uses the Firebase v9+ Modular SDK)
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. FIREBASE — config + lazy init
   Replace the placeholder strings below with your own project's config
   from the Firebase console: Project settings ▸ Your apps ▸ Web app.

   NOTE: Firebase is loaded lazily (dynamic import) so that if the SDK
   is slow or blocked, the chore list still renders. The UI never depends
   on Firebase being reachable.
--------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey:            "AIzaSyDwtM5iDEXZ9yPn3S6rXFlDbN-c_kXWMD4",
  authDomain:        "canyon-chore-chart.firebaseapp.com",
  projectId:         "canyon-chore-chart",
  storageBucket:     "canyon-chore-chart.firebasestorage.app",
  messagingSenderId: "810765880970",
  appId:             "1:810765880970:web:a6b342390620133b596773",
  measurementId:     "G-ESQYLP7D0B"
};

let db = null;          // Firestore instance (set once loaded)
let fb = null;          // { doc, setDoc, serverTimestamp }

async function initFirebase() {
  if (db) return db;    // already initialised
  const appMod = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const fsMod  = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const app = appMod.initializeApp(firebaseConfig);
  db = fsMod.getFirestore(app);
  fb = {
    doc:            fsMod.doc,
    setDoc:         fsMod.setDoc,
    serverTimestamp: fsMod.serverTimestamp
  };
  return db;
}

// Kick off loading in the background — but don't let a failure stop the UI.
initFirebase().catch((e) =>
  console.warn("[ChoreTracker] Firebase not ready yet:", e.message));

/* ---------------------------------------------------------------------
   2. CHORE DATA — grouped by category.
   Each chore gets a stable `id` used as part of the Firestore doc id.
--------------------------------------------------------------------- */
const CHORE_DATA = [
  {
    category: "Opening Chores",
    open: true,                      // first section expanded by default
    items: [
      "Unlock keys",
      "Open guard office",
      "Open bathrooms & check TP/paper towels",
      "Bring out CrashBag & Backboard",
      "Open umbrellas",
      "Take chems (pressure gauges & temp)",
      "Skim top of pool",
      "Turn on Baby Pool features (10:00 AM / 11:00 AM)",
      "Empty skimmer baskets",
      "Put out “LAP SWIM ONLY” sign",
      "Ensure trash cans are empty & have bags",
      "Deck Sweep"
    ]
  },
  {
    category: "Mid-Day Chores",
    items: [
      "Patron Count — 10:30 AM",
      "Patron Count — 11:30 AM",
      "Patron Count — 12:30 PM",
      "Patron Count — 1:30 PM",
      "Patron Count — 2:30 PM",
      "Patron Count — 3:30 PM",
      "Patron Count — 4:30 PM",
      "Patron Count — 5:30 PM",
      "Patron Count — 6:30 PM",
      "Patron Count — 7:30 PM",
      "3:00 PM — Take Chems",
      "Deck Sweep"
    ]
  },
  {
    category: "Closing Chores",
    items: [
      "Closing Chems",
      "Put away Lap Lane Only sign",
      "Close umbrellas",
      "Disinfect surfaces",
      "Evening skim",
      "Sweep restrooms & ensure stocked",
      "Take out trash",
      "Clear Lost & Found from deck",
      "Organize furniture",
      "Organize guard office",
      "Check & lock bathrooms/office/keys"
    ]
  },
  {
    category: "Sometimes Chores",
    items: [
      "Scrub tile line",
      "Brush bottom of the pool",
      "Vacuum pool",
      "Organize Lost & Found bags/bins"
    ]
  }
];

/* ---------------------------------------------------------------------
   4. HELPERS
--------------------------------------------------------------------- */

// Today's date as YYYY-MM-DD (local) — used to scope chores per day.
function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Turn a chore label into a URL/id-safe slug.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Firestore doc id: one document per chore per day.
function choreDocId(category, label) {
  return `${todayKey()}_${slugify(category)}_${slugify(label)}`;
}

/* ---------------------------------------------------------------------
   5. RENDER — build the accordions and chore rows
--------------------------------------------------------------------- */
const choreListEl = document.getElementById("chore-list");

function renderChores() {
  choreListEl.innerHTML = "";

  CHORE_DATA.forEach((section, sIdx) => {
    const acc = document.createElement("div");
    acc.className = "accordion" + (section.open ? " is-open" : "");

    // --- header ---
    const header = document.createElement("button");
    header.type = "button";
    header.className = "accordion__header";
    header.setAttribute("aria-expanded", String(!!section.open));
    header.innerHTML = `
      <span class="accordion__title-wrap">
        <span>${section.category}</span>
        <span class="accordion__count">${section.items.length}</span>
      </span>
      <span class="accordion__chevron" aria-hidden="true">&#9660;</span>
    `;
    header.addEventListener("click", () => {
      acc.classList.toggle("is-open");
      header.setAttribute("aria-expanded",
        String(acc.classList.contains("is-open")));
    });

    // --- body ---
    const body = document.createElement("div");
    body.className = "accordion__body";

    section.items.forEach((label) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "chore";
      row.dataset.category = section.category;
      row.dataset.label = label;
      row.innerHTML = `
        <span class="chore__box" aria-hidden="true"></span>
        <span class="chore__label">${label}</span>
        <span class="chore__meta"></span>
      `;
      row.addEventListener("click", () => {
        if (row.classList.contains("is-done")) return; // already completed
        openModal(section.category, label, row);
      });
      body.appendChild(row);
    });

    acc.appendChild(header);
    acc.appendChild(body);
    choreListEl.appendChild(acc);
  });
}

/* ---------------------------------------------------------------------
   6. MODAL logic
--------------------------------------------------------------------- */
const overlay      = document.getElementById("modal-overlay");
const modalForm    = document.getElementById("modal-form");
const modalTitle   = document.getElementById("modal-title");
const modalCat     = document.getElementById("modal-category");
const guardInput   = document.getElementById("guard-name");
const confirmBox   = document.getElementById("confirm-box");
const confirmLabel = document.getElementById("confirm-label");
const submitBtn    = document.getElementById("submit-btn");
const statusEl     = document.getElementById("modal-status");
const closeBtn     = document.getElementById("modal-close");

/* -------------------- SIGNATURE PAD -------------------- */
const sigWrap  = document.querySelector(".sig-wrap");
const sigCanvas = document.getElementById("sig-pad");
const sigClear  = document.getElementById("sig-clear");
const sigHint   = document.getElementById("sig-hint");
const sigCtx    = sigCanvas.getContext("2d");

let hasSignature = false;
let drawing = false;
let sigLocked = true;   // signing is locked until the 100% box is checked

// Size the canvas to its box (crisp on high-DPI screens). Called when the
// modal opens, because the element has no size while hidden.
function resizeSignature() {
  const rect = sigWrap.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  sigCanvas.width  = rect.width  * ratio;
  sigCanvas.height = rect.height * ratio;
  sigCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";
  sigCtx.strokeStyle = "#182F4D"; // navy ink
}

function clearSignature() {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  hasSignature = false;
  sigWrap.classList.remove("has-ink");
  updateGates();
}

// Wipe the ink without re-running the gate logic (avoids recursion).
function wipeInk() {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  hasSignature = false;
  sigWrap.classList.remove("has-ink");
}

// Convert a pointer event to canvas coordinates.
function pointFromEvent(e) {
  const rect = sigCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startStroke(e) {
  if (sigLocked) return;          // can't sign until the box is checked
  e.preventDefault();
  drawing = true;
  const p = pointFromEvent(e);
  sigCtx.beginPath();
  sigCtx.moveTo(p.x, p.y);
}
function moveStroke(e) {
  if (sigLocked || !drawing) return;
  e.preventDefault();
  const p = pointFromEvent(e);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
  if (!hasSignature) {
    hasSignature = true;
    sigWrap.classList.add("has-ink");
    updateGates();
  }
}
function endStroke() { drawing = false; }

sigCanvas.addEventListener("pointerdown", startStroke);
sigCanvas.addEventListener("pointermove", moveStroke);
sigCanvas.addEventListener("pointerup", endStroke);
sigCanvas.addEventListener("pointerleave", endStroke);
sigClear.addEventListener("click", clearSignature);

/* -------------------- MODAL OPEN / CLOSE -------------------- */

// Track which chore is currently being confirmed.
let activeChore = null; // { category, label, rowEl }

// One cascading gate that enforces the step order:
//   1) type name  ->  2) unlocks the 100% checkbox
//   2) check box   ->  3) unlocks signing
//   3) sign        ->  enables Submit
function updateGates() {
  const nameOk = guardInput.value.trim() !== "";

  // STEP 2 — checkbox unlocks once a name is entered
  confirmBox.disabled = !nameOk;
  confirmLabel.classList.toggle("is-locked", !nameOk);
  if (!nameOk && confirmBox.checked) confirmBox.checked = false;

  // STEP 3 — signing unlocks once the box is checked
  const canSign = nameOk && confirmBox.checked;
  sigLocked = !canSign;
  sigWrap.classList.toggle("is-locked", !canSign);
  if (!canSign && hasSignature) wipeInk();  // remove signature if box unticked

  // Update the hint text on the pad
  if (!canSign) {
    sigHint.textContent = "Check the box above, then sign here";
  } else if (!hasSignature) {
    sigHint.textContent = "Sign here with your finger";
  }

  // Submit — everything done
  submitBtn.disabled = !(canSign && hasSignature);
}

function openModal(category, label, rowEl) {
  activeChore = { category, label, rowEl };
  modalCat.textContent   = category;
  modalTitle.textContent = label;

  // reset form state
  modalForm.reset();
  guardInput.value = "";
  confirmBox.checked = false;
  submitBtn.disabled = true;
  statusEl.textContent = "";
  statusEl.className = "modal__status";

  overlay.hidden = false;
  document.body.style.overflow = "hidden";

  // canvas has real dimensions only once visible
  requestAnimationFrame(() => {
    resizeSignature();
    clearSignature();
  });
}

function closeModal() {
  overlay.hidden = true;
  activeChore = null;
  document.body.style.overflow = "";
}

// Re-check the gates whenever any input changes.
guardInput.addEventListener("input", updateGates);
confirmBox.addEventListener("change", updateGates);

closeBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal(); // tap backdrop to dismiss
});

/* ---------------------------------------------------------------------
   7. SUBMIT — write to Firestore
--------------------------------------------------------------------- */
modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeChore) return;

  const guardName = guardInput.value.trim();
  if (!guardName) {
    statusEl.textContent = "Please type your name.";
    statusEl.className = "modal__status is-error";
    return;
  }
  if (!hasSignature) {
    statusEl.textContent = "Please sign in the box above.";
    statusEl.className = "modal__status is-error";
    return;
  }
  if (!confirmBox.checked) return; // safety net

  // Capture the signature as a PNG data URL — this is what gets "locked in".
  const signatureData = sigCanvas.toDataURL("image/png");

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";
  statusEl.textContent = "";
  statusEl.className = "modal__status";

  const { category, label, rowEl } = activeChore;
  const id = choreDocId(category, label);

  try {
    // Make sure Firebase is ready (loads on demand if it wasn't).
    await initFirebase();

    await fb.setDoc(fb.doc(db, "chores", id), {
      chore:                label,
      category:             category,
      date:                 todayKey(),
      status:               "completed",
      completed_by:         guardName,
      signature:            signatureData,   // locked-in signature image
      completed_at:         fb.serverTimestamp(),
      require_lead_signoff: true
    });

    // Reflect completion in the UI
    markRowDone(rowEl, guardName);

    statusEl.textContent = "Saved ✓";
    statusEl.className = "modal__status is-ok";
    setTimeout(closeModal, 700);

  } catch (err) {
    console.error("[ChoreTracker] Firestore write failed:", err);
    statusEl.textContent = "Couldn't save — check your connection and try again.";
    statusEl.className = "modal__status is-error";
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = "Submit";
  }
});

function markRowDone(rowEl, guardName) {
  rowEl.classList.add("is-done");
  const box  = rowEl.querySelector(".chore__box");
  const meta = rowEl.querySelector(".chore__meta");
  if (box)  box.innerHTML = "&#10003;";
  if (meta) meta.textContent = guardName;
}

/* ---------------------------------------------------------------------
   8. BOTTOM NAV — switch between Guard view and Manager placeholder
--------------------------------------------------------------------- */
const guardView   = document.getElementById("view-guard");
const managerView = document.getElementById("view-manager");
const navBtns     = document.querySelectorAll(".nav-btn");

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    navBtns.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const view = btn.dataset.view;
    guardView.hidden   = view !== "guard";
    managerView.hidden = view !== "manager";
  });
});

/* ---------------------------------------------------------------------
   9. BOOT
--------------------------------------------------------------------- */
renderChores();

// Show today's date in the subtitle.
const todayLabel = document.getElementById("today-label");
if (todayLabel) {
  const nice = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric"
  });
  todayLabel.textContent = `${nice} — tap a chore when it's done, then confirm.`;
}
