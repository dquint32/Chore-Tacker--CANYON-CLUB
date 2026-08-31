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
  const authMod = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const app = appMod.initializeApp(firebaseConfig);
  db = fsMod.getFirestore(app);

  // Sign in anonymously so the security rules can require an app session.
  // (Requires "Anonymous" sign-in to be enabled in Firebase Auth.)
  const auth = authMod.getAuth(app);
  await authMod.signInAnonymously(auth);

  fb = {
    doc:             fsMod.doc,
    setDoc:          fsMod.setDoc,
    updateDoc:       fsMod.updateDoc,
    deleteDoc:       fsMod.deleteDoc,
    serverTimestamp: fsMod.serverTimestamp,
    collection:      fsMod.collection,
    query:           fsMod.query,
    where:           fsMod.where,
    onSnapshot:      fsMod.onSnapshot
  };
  return db;
}

// Kick off loading in the background — but don't let a failure stop the UI.
// Once ready, start both live listeners (guard grid + manager queue).
initFirebase()
  .then(() => { startLiveSync(); startManagerSync(); })
  .catch((e) =>
    console.warn("[ChoreTracker] Firebase not ready — running offline:", e.message));

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

// A stable key identifying a chore regardless of day.
function choreKey(category, label) {
  return `${slugify(category)}__${slugify(label)}`;
}

// Firestore doc id: one document per chore per day.
function choreDocId(category, label) {
  return `${todayKey()}_${slugify(category)}_${slugify(label)}`;
}

// Map of choreKey -> row element, so a live update can find the right row.
const rowIndex = {};

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
      const key = choreKey(section.category, label);
      row.dataset.key = key;
      rowIndex[key] = row;               // register for live updates
      row.innerHTML = `
        <span class="chore__box" aria-hidden="true"></span>
        <span class="chore__label">${label}</span>
        <span class="chore__meta"></span>
      `;
      row.addEventListener("click", () => {
        if (row.classList.contains("is-approved")) return;   // locked by lead
        if (row.classList.contains("is-done")) {             // pending → allow undo
          openUndo(section.category, label, row);
          return;
        }
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
   5b. LIVE SYNC — listen to today's completed chores in real time.
   Every guard's phone updates within ~1s of anyone finishing a chore,
   and the state is restored on page reload. Prevents double-work.
--------------------------------------------------------------------- */
function startLiveSync() {
  if (!db || !fb.onSnapshot) return;

  const q = fb.query(
    fb.collection(db, "chores"),
    fb.where("date", "==", todayKey())
  );

  fb.onSnapshot(q, (snapshot) => {
    // Full reconcile: clear every row, then re-apply from current data.
    // This way undos (deleted docs) and name edits show up correctly.
    Object.values(rowIndex).forEach(resetRow);

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status !== "completed") return;
      const row = rowIndex[data.key];
      if (row) markRowDone(row, data.completed_by, data.require_lead_signoff === false);
    });
  }, (err) => {
    console.warn("[ChoreTracker] Live sync error:", err.message);
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
      key:                  choreKey(category, label),  // matches a row for live sync
      status:               "completed",
      completed_by:         guardName,
      signature:            signatureData,   // locked-in signature image
      completed_at:         fb.serverTimestamp(),
      require_lead_signoff: true
    });

    // Reflect completion immediately (live sync will confirm across devices).
    markRowDone(rowEl, guardName, false);

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

function markRowDone(rowEl, guardName, approved) {
  rowEl.classList.add("is-done");
  rowEl.classList.toggle("is-approved", !!approved);
  rowEl.dataset.doneBy = guardName || "";
  const box  = rowEl.querySelector(".chore__box");
  const meta = rowEl.querySelector(".chore__meta");
  if (box)  box.innerHTML = "&#10003;";
  if (meta) {
    meta.textContent = approved
      ? `${guardName} · approved ✓`
      : `${guardName} · tap to undo`;
  }
}

function resetRow(rowEl) {
  rowEl.classList.remove("is-done", "is-approved");
  delete rowEl.dataset.doneBy;
  const box  = rowEl.querySelector(".chore__box");
  const meta = rowEl.querySelector(".chore__meta");
  if (box)  box.innerHTML = "";
  if (meta) meta.textContent = "";
}

/* ---------------------------------------------------------------------
   8. BOTTOM NAV — switch between Guard view and Manager placeholder
--------------------------------------------------------------------- */
const guardView   = document.getElementById("view-guard");
const managerView = document.getElementById("view-manager");
const navBtns     = document.querySelectorAll(".nav-btn");

function switchView(view) {
  navBtns.forEach((b) =>
    b.classList.toggle("is-active", b.dataset.view === view));
  guardView.hidden   = view !== "guard";
  managerView.hidden = view !== "manager";
}

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    // The Sign-Off (manager) view is protected by a PIN until unlocked.
    if (view === "manager" && !managerUnlocked) {
      openPin();
      return;
    }
    switchView(view);
  });
});

/* ---------------------------------------------------------------------
   8d. PIN GATE — protects the manager Sign-Off view
   NOTE: this is a lightweight deterrent, not real security (the PIN
   lives in this file). For a small trusted staff it keeps guards out of
   the approval screen. Change LEAD_PIN to update it.
--------------------------------------------------------------------- */
const LEAD_PIN = "4500";
let managerUnlocked = false;   // resets on page reload

const pinOverlay = document.getElementById("pin-overlay");
const pinDotsWrap = document.getElementById("pin-dots");
const pinDots    = pinOverlay.querySelectorAll(".pin-dot");
const pinStatus  = document.getElementById("pin-status");
const pinClose   = document.getElementById("pin-close");
const keypad     = document.getElementById("keypad");
let pinEntry = "";

function renderPinDots() {
  pinDots.forEach((d, i) => d.classList.toggle("is-filled", i < pinEntry.length));
}

function openPin() {
  pinEntry = "";
  renderPinDots();
  pinStatus.textContent = "";
  pinStatus.className = "modal__status";
  pinOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}
function closePin() {
  pinOverlay.hidden = true;
  document.body.style.overflow = "";
}

function checkPin() {
  if (pinEntry === LEAD_PIN) {
    managerUnlocked = true;
    closePin();
    switchView("manager");
  } else {
    pinStatus.textContent = "Incorrect PIN — try again.";
    pinStatus.className = "modal__status is-error";
    pinDotsWrap.classList.add("is-shake");
    setTimeout(() => {
      pinDotsWrap.classList.remove("is-shake");
      pinEntry = "";
      renderPinDots();
    }, 400);
  }
}

keypad.addEventListener("click", (e) => {
  const key = e.target.closest(".keypad__key");
  if (!key) return;
  if (key.dataset.del) {
    pinEntry = pinEntry.slice(0, -1);
    renderPinDots();
    return;
  }
  const digit = key.dataset.d;
  if (digit == null || pinEntry.length >= 4) return;
  pinEntry += digit;
  renderPinDots();
  if (pinEntry.length === 4) setTimeout(checkPin, 150);
});

pinClose.addEventListener("click", closePin);
pinOverlay.addEventListener("click", (e) => {
  if (e.target === pinOverlay) closePin();
});

/* ---------------------------------------------------------------------
   8b. UNDO — reset an accidental / wrong completion
--------------------------------------------------------------------- */
const undoOverlay = document.getElementById("undo-overlay");
const undoMsg     = document.getElementById("undo-msg");
const undoStatus  = document.getElementById("undo-status");
const undoConfirm = document.getElementById("undo-confirm");
const undoCancel  = document.getElementById("undo-cancel");
const undoClose   = document.getElementById("undo-close");

let activeUndo = null; // { category, label, rowEl }

function openUndo(category, label, rowEl) {
  activeUndo = { category, label, rowEl };
  const who = rowEl.dataset.doneBy || "someone";
  undoMsg.innerHTML =
    `<strong>${label}</strong> was marked done by <strong>${who}</strong>. ` +
    `Undo it so the chore is open again?`;
  undoStatus.textContent = "";
  undoStatus.className = "modal__status";
  undoOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeUndo() {
  undoOverlay.hidden = true;
  activeUndo = null;
  document.body.style.overflow = "";
}

undoCancel.addEventListener("click", closeUndo);
undoClose.addEventListener("click", closeUndo);
undoOverlay.addEventListener("click", (e) => {
  if (e.target === undoOverlay) closeUndo();
});

undoConfirm.addEventListener("click", async () => {
  if (!activeUndo) return;
  const { category, label } = activeUndo;
  undoConfirm.disabled = true;
  undoConfirm.textContent = "Undoing…";
  try {
    await initFirebase();
    await fb.deleteDoc(fb.doc(db, "chores", choreDocId(category, label)));
    // Live sync will clear the row on every device.
    closeUndo();
  } catch (err) {
    console.error("[ChoreTracker] Undo failed:", err);
    undoStatus.textContent = "Couldn't undo — check connection and try again.";
    undoStatus.className = "modal__status is-error";
  } finally {
    undoConfirm.disabled = false;
    undoConfirm.textContent = "Undo";
  }
});

/* ---------------------------------------------------------------------
   8c. MANAGER SIGN-OFF — live queue of chores awaiting approval
--------------------------------------------------------------------- */
const signoffList  = document.getElementById("signoff-list");
const signoffEmpty = document.getElementById("signoff-empty");
const signoffCount = document.getElementById("signoff-count");
const leadNameInput = document.getElementById("lead-name");

function startManagerSync() {
  if (!db || !fb.onSnapshot) return;
  const q = fb.query(
    fb.collection(db, "chores"),
    fb.where("require_lead_signoff", "==", true)
  );
  fb.onSnapshot(q, (snapshot) => {
    const docs = [];
    snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));
    // newest first (guard against a pending server timestamp = null)
    docs.sort((a, b) => (b.completed_at?.seconds || 0) - (a.completed_at?.seconds || 0));
    renderSignoff(docs);
  }, (err) => {
    console.warn("[ChoreTracker] Manager sync error:", err.message);
  });
}

function fmtTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return "just now";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function renderSignoff(docs) {
  // Update the badge on the Sign-Off nav button
  if (docs.length > 0) {
    signoffCount.textContent = String(docs.length);
    signoffCount.hidden = false;
  } else {
    signoffCount.hidden = true;
  }

  // Clear old cards (keep the empty-state note element)
  signoffList.querySelectorAll(".signoff-card").forEach((el) => el.remove());

  if (docs.length === 0) {
    signoffEmpty.hidden = false;
    return;
  }
  signoffEmpty.hidden = true;

  docs.forEach((d) => {
    const card = document.createElement("div");
    card.className = "signoff-card";
    card.innerHTML = `
      <p class="signoff-card__chore"></p>
      <p class="signoff-card__meta"></p>
      <p class="signoff-card__siglabel">Signature</p>
      <img class="signoff-card__sig" alt="Signature" />
      <div class="signoff-card__actions">
        <button class="btn-reject" type="button">Reject</button>
        <button class="btn-approve" type="button">Approve</button>
      </div>
    `;
    card.querySelector(".signoff-card__chore").textContent = d.chore || "(chore)";
    card.querySelector(".signoff-card__meta").innerHTML =
      `${d.category || ""} &middot; by <strong>${d.completed_by || "?"}</strong> &middot; ${fmtTime(d.completed_at)}`;
    const img = card.querySelector(".signoff-card__sig");
    if (d.signature) img.src = d.signature; else img.remove();

    card.querySelector(".btn-approve").addEventListener("click", () => approveChore(d.id));
    card.querySelector(".btn-reject").addEventListener("click", () => rejectChore(d.id));
    signoffList.appendChild(card);
  });
}

async function approveChore(id) {
  const lead = (leadNameInput.value || "").trim();
  if (!lead) {
    leadNameInput.focus();
    leadNameInput.style.borderColor = "#ff8b8b";
    return;
  }
  leadNameInput.style.borderColor = "";
  try {
    await initFirebase();
    await fb.updateDoc(fb.doc(db, "chores", id), {
      require_lead_signoff: false,
      approved_by: lead,
      approved_at: fb.serverTimestamp()
    });
    // Live sync will drop it from the queue and turn the guard row green.
  } catch (err) {
    console.error("[ChoreTracker] Approve failed:", err);
  }
}

async function rejectChore(id) {
  try {
    await initFirebase();
    await fb.deleteDoc(fb.doc(db, "chores", id));
    // Live sync removes the card and frees the chore on the guard grid.
  } catch (err) {
    console.error("[ChoreTracker] Reject failed:", err);
  }
}

/* ---------------------------------------------------------------------
   8e. HELP — in-app instructions for guards & leads
--------------------------------------------------------------------- */
const helpBtn      = document.getElementById("help-btn");
const helpOverlay  = document.getElementById("help-overlay");
const helpClose    = document.getElementById("help-close");
const helpTabGuard = document.getElementById("help-tab-guard");
const helpTabLead  = document.getElementById("help-tab-lead");
const helpPanelGuard = document.getElementById("help-panel-guard");
const helpPanelLead  = document.getElementById("help-panel-lead");

function openHelp() {
  helpOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeHelp() {
  helpOverlay.hidden = true;
  document.body.style.overflow = "";
}
function showHelpTab(which) {
  const guard = which === "guard";
  helpTabGuard.classList.toggle("is-active", guard);
  helpTabLead.classList.toggle("is-active", !guard);
  helpPanelGuard.hidden = !guard;
  helpPanelLead.hidden  = guard;
}

helpBtn.addEventListener("click", openHelp);
helpClose.addEventListener("click", closeHelp);
helpOverlay.addEventListener("click", (e) => {
  if (e.target === helpOverlay) closeHelp();
});
helpTabGuard.addEventListener("click", () => showHelpTab("guard"));
helpTabLead.addEventListener("click", () => showHelpTab("lead"));

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
