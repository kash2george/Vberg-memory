# VBerg Algorithm & Database — Consolidated Specification

**Purpose:** one place that holds everything decided so far, so no conclusion from the research is lost. It merges the Phase 1 architecture, the methodology research, the external research review, and the cognitive-science pass. Where an earlier document disagrees with this one, **this one wins.**

**Status:** specification. No implementation yet.
**Labels:** `[proven]` mathematical guarantee · `[evidence]` supported by research · `[heuristic]` design rule, not proven · `[test]` open question, needs an experiment.

---

## 0. VBerg in one sentence

> **VBerg is an ordered tree of data where one line at a time gets full resolution on a hill, divided into 3–5 groups, while the rest of the structure stays visible in compressed form — and every picture is computed from the data, never stored.**

Mathematically: *a measure on a nested interval hierarchy, locally re-weighted around a focus, pushed through a deterministic path.*

---

## 1. The data (the only thing that is stored)

| Object | Meaning |
|---|---|
| **Node** | Stable ID, type, label, value. No coordinates, ever. |
| **Arc** (parent → child) | Structural membership. **Carries the ordinal** (fractional key). A node may have several parents (ordered multitree); each arc has its own ordinal. |
| **Edge** | Typed relationship (`works_on`, `depends_on`…). Not hierarchy. |
| **Container order kind** | `sequence` (order is information; reorder = semantic edit) or `set` (order is not information; has a declared **home arrangement**). |
| **Source tree + provenance** | Imported file structure kept verbatim, linked N:M to nodes, marked `explicit` (DOCX/PPTX) or `inferred + confidence` (PDF). |
| **Annotations** | User intent: landmarks, emphasis, chunk overrides. Keyed by ID, never coordinates. |
| **View state** | Current focus path. Optional, expressed in IDs. |

**Occurrence** (derived, not stored) = `(nodeId, arcId, contextPath)`. The same node under two parents is one node seen twice.

**Never stored:** x, y, u, track index, hill parameters, label boxes, aggregates, animation state.

---

## 1b. The database

The database **is the threads** (see `vberg-threads.md`). Every thread is made of points; every point, opened, is a thread. No separate structure is needed for documents, slides, or database tables: all become threads of threads.

### Tables

```
nodes                         one row per idea / point
─────────────────────────────────────────────────────
id      text                  type         value
rm      "Risk Management"     concept
s1      "Risk management…"    sentence
f1      "Lecture 3"           file
```

```
placements                    a point's place on a thread  (= Arc)
─────────────────────────────────────────────────────
node    thread    order       orderKind of the thread
rm      lecture   "c"         sequence
rm      pdf-45    "b"         sequence
rm      exam      "b"         sequence
rm      iso       "c"         sequence
```

```
links                         meaning between two points   (= Edge)
─────────────────────────────────────────────────────
from    to      type          source
rm      ctl-7   protects_by   user
s1      b7      same_idea     computed
```

Supporting tables: `sources` (imported files, hash, parser version), `annotations` (landmarks, manual regroup, emphasis), `viewstate` (focus path, in IDs), `commandlog` (every change, for undo and replay).

### Rules

- **No x, no y, no u** anywhere. Screen position is computed from `order`.
- **One idea is stored once** in `nodes`. If it appears in several places, it has several rows in `placements`, each with its own order on its own thread.
- **An intersection is a link.** A node with placements on several threads connects those threads at that node. No extra "slide 12 ↔ page 45" row is needed. Intersection count is a free measure of importance (Lynch 1960: junctions are strong memory landmarks).
- **Links are not placements.** A link is shared by two nodes; storing it as parent/child would create cycles.
- **Words and letters are not stored.** Derived from `text` when a sentence or word is opened. A sub-point becomes a real node only when something attaches to it (a link, a note).
- **Groups (3–5) are not stored.** Computed by S3 each time. Only a manual regroup is stored, as an annotation.
- `order` is a **fractional key**: inserting between two points creates one new key and rewrites nothing else.

### A table is threads that cross

In a database table, every **row** is a thread (one record across its fields) and every **column** is a thread (one field down all records). Every **cell** is the intersection of a row thread and a column thread. Rows and columns differ only in how a screen draws them; in the data there is only thread and order. *(George, 2026-10-09)*

### Every source maps to the same shape

| Source | Thread of threads |
|---|---|
| PDF | file → page → paragraph → sentence |
| Word | document → heading → paragraph → sentence |
| Slides | presentation → slide → bullet |
| Database | table → row → field |
| Notes | note → paragraph → sentence |

### Three kinds of links

| Kind | Made by | Stored as |
|---|---|---|
| Structure (parent, child, neighbour, same file) | free | `placements` |
| Same words in two files | computer (may miss synonyms/other languages, may over-link) | `links`, `source = computed`, needs confirmation |
| Meaning (causes, example of, protects against) | person or AI | `links`, `source = user / ai` |

### Implementation

Use an existing engine (SQLite or IndexedDB); do not build a storage engine. Indexes: `placements(thread, order)` for drawing a thread in one range query; `placements(node)` for finding every thread through a point; `links(from)`, `links(to)`.

A VBerg **language** may later sit on top, with no keyword for position, so rule 1 cannot be broken. Start as JSON; design the language after 2–3 real datasets.

---

## 2. The algorithm

Input: data + focus path + viewport. Output: a picture. Every step is a pure function.

```
DATA
 │  S1  PROJECT      focus node → its ordered line of occurrences
 │  S2  RESOLVE      who gets FULL / MEDIUM / AGGREGATE / LANDMARK
 │  S3  GROUP        FULL line → 3–5 groups
 │  S4  COMPRESS     everything else → contiguous aggregates + landmarks
 ├──────── measurement boundary (nothing above reads a font metric) ────────
 │  S5  ALLOCATE     positive weights → u ∈ [0,1], order guaranteed
 │  S6  WARP         local focus density, zero outside displacement
 │  S7  EMBED        u → screen: hill for the FULL line, straight for context
 │  S8  LABEL        pack labels; anchors never move
 │  S9  TRANSITION   animate old → new by occurrence identity
 │  S10 INTERACT     click → command → data changes → recompute from S1
 ▼
PICTURE
```

### S1 — Project
The focus node's children, ordered:
- `sequence`: by arc ordinal.
- `set`: by its home arrangement. A temporary sort is view state and is visibly marked "away from home".

### S2 — Resolve (the "cognitive budget", correctly defined)
Each occurrence gets a **degree of interest**:

```
DOI(n) = importance(n) − λ · structuralDistance(n, focus)
```

Distance is **ordinal/structural, never pixels.** DOI is quantized into four tiers:

| Tier | Who | Shown as |
|---|---|---|
| **FULL** | the focused line | full labels, on the hill, grouped |
| **MEDIUM** | the parent line (siblings of the focus) | labels, straight, ordered |
| **AGGREGATE** | ranges further away | one summary item per contiguous range |
| **LANDMARK** | far structure | markers + landmark nodes only |

**Key rule:** FULL is exactly **one line**, split into **3–5 groups** by default. The reason is **spatial**: each group needs its own place on the screen, paper or board (George, 2026-10-09). It is a default, not a hard limit: the split is dynamic and the user can play with it. See §12. `[heuristic]`

### S3 — Group (from the prototype, generalized)
Split the FULL line into G ∈ {3, 4, 5} contiguous groups. Score each candidate split, keep the lowest:

```
score = balance(group sizes) + 1.5 · |first − last| + boundaryPenalty + 0.15 · (G − 3)
```

- `balance` = standard deviation of group sizes.
- First/last symmetry penalty kept from `scoreGrouping`.
- `boundaryPenalty`: cheap where the data has a natural break (type change, heading, semantic gap), expensive inside a coherent run. For words this becomes the syllable rule from `microSyllables`.
- A user chunk override is an annotation and replaces the computed split.

### S4 — Compress
Everything not FULL or MEDIUM:
- Consecutive items → one **aggregate over a contiguous ordinal range.** Never pull items out of order.
- The aggregate **inherits exactly the interval its members occupied**, so total measure is unchanged. `[proven]`
- Aggregate identity is derived from its range → the same range always looks the same.
- Landmark nodes survive every compression level, with a colour/glyph derived from their ID.
- Number of visible entities is capped by a clutter budget (Elmqvist & Fekete). `[evidence]`

### S5 — Allocate
Each visible element has a weight `wᵢ > 0`, derived from **semantics** (default 1; aggregates carry the sum of their members), **not from text width.**

```
u_i = (Σ_{k<i} w_k) / (Σ_k w_k)
```

Every weight is positive, so `u` is strictly increasing. **Order cannot invert. No repair pass exists.** `[proven]`

### S6 — Warp (the bubble)
Focus acts as a density:

```
ρ(s) = 1 + φ(s)
```

| Property of φ | Guarantee |
|---|---|
| φ > −1 | ρ > 0 → order preserved `[proven]` |
| φ = 0 outside the support | items outside the bubble move **exactly zero** `[proven]` |
| ∫φ = 0 | total measure conserved, no renormalization seam `[proven]` |
| φ ∈ C¹ | spacing continuous, no visible jump `[proven]` |
| φ ≥ ρ_min − 1 | context never crushed below a readable minimum |

Shape: a **core** that expands and a **shoulder** that absorbs the expansion, returning smoothly to 1 at the edge.

Focus is **discrete and committed** (click, keys, scroll-snap, animated), not cursor-following. Magnifying under a moving cursor measurably hurts targeting (Gutwin 2002; the Dock). `[evidence]`

If the line cannot fit readably: switch from **Conserve** (fixed width) to **Extend** (the line grows and pans) or compress more. Never overlap, never reorder.

### S7 — Embed
`u → (x, y)` by arc length along a path.
- **FULL line → Hill.** The hill is a **local lens over the focused line**, not a shape for the whole dataset. `[evidence + heuristic]`
- Context → straight line on either side.
- Hill parameters = `hash(nodeId)` → the same node always has the same hill. **Never random.**
- **Reading direction follows the language of the thread**, never a fixed screen rule. The path is monotone in that direction: left → right (Swedish, English), right → left (Arabic: the climb starts on the right), top → bottom (vertical Chinese/Japanese: the hill turns sideways). Direction is chosen at display time; nothing about direction is stored except the thread's language. Mixed-language lines follow standard bidirectional text rules. *(Changed 2026-10-09, George: earlier text assumed left → right only.)*
- Other embeddings (radial mind map, matrix for dense relations) consume the same `u`.

### S8 — Label
Anchors are fixed by S5–S7. Labels get their own coordinate `v`:

```
minimize    Σ λᵢ (vᵢ − cᵢ)²
subject to  v_{i+1} − vᵢ ≥ gapᵢ
```

Substituting `zᵢ = vᵢ − Σ_{k<i} gapₖ` turns this into **isotonic regression**, solved exactly in O(n) by pool-adjacent-violators. Deterministic, no iteration, continuous in its input. `[proven]`
- Landmarks get high λ → they resist displacement without being pinned.
- If labels still do not fit: shrink font → shorten label → drop to a lower tier. **Never** move the anchor, **never** stack vertically, **never** reorder.

### S9 — Transition
Match old and new picture by occurrence ID. Animate short (~300 ms) and staged (spacing, then hill, then labels). Animation helps object tracking (Heer & Robertson 2007) `[evidence]` and counters change blindness when context re-compresses.

### S10 — Interact
Every gesture becomes a command in IDs and ordinals, never coordinates:
- click item → `setFocus(occurrence)` → recurse
- drag between items → `reorder(node, after)` for sequences; ignored for sets
- drag onto item → `reparent`

Data changes → recompute from S1. The picture updates by itself.

---

## 3. Recursion

Opening an item: its interval `[u_i, u_{i+1}]` becomes a new line with its own `[0,1]`. The same algorithm runs at every level:

```
Folder → Files → Sections → Sentences → Concepts → Words → Syllables → Characters
```

The prototype's `charMode` is simply this recursion at the deepest level.

**Depth rule:** the model can be infinitely deep, but **at most 1–2 levels are warped at the same time** (the focused line, optionally its parent as MEDIUM). Deeper levels open by navigation, not by simultaneous distortion. No research shows deep composed distortion stays readable. `[test]`

---

## 4. Invariants (tests that must always pass)

1. Focus on C in A,B,C,D,E → order stays A,B,C,D,E for every radius and strength.
2. Focus, zoom, view switch, expand → data hash unchanged.
3. Items outside the bubble: displacement exactly 0.
4. Same data + same view → same visible set, tiers, groups, aggregates on **every device** (measurement-free).
5. Same data + view + fonts → same picture, twice, in two processes.
6. The hill of an unchanged node never changes between reloads.
7. Insert X between C and D → no other ordinal rewritten; order A,B,C,X,D,E.
8. Label packing never changes an anchor.
9. Every aggregate resolves exactly to a contiguous range of members.
10. Same node under two parents → one ID, two occurrences.
11. Sorting a set never touches ordinals.
12. No coordinate appears in any stored record.
13. Replaying all commands rebuilds the same data.
14. Every gesture emits a command containing IDs/ordinals only.

---

## 5. From the prototype

**Keep (VBerg's real discoveries):**
- position comes from the track, never assigned directly (`_syncBoxToTrack`)
- arc-length spacing
- movement only along the path
- items clamped to their group segment
- 3–5 groups with balance + first/last symmetry scoring
- common words smaller (semantic salience)
- shrink before moving; no vertical stacking
- drag → semantic command (`tryMove`)
- guides overlay as a debug tool

**Remove:**
- `randomHP()` → `hash(id)`
- `trkIdx` pixel index → normalized `u`
- both order-repair passes → guaranteed by S5
- `_wordMemory[]` → deterministic layout + S9 animation
- font boost from hill height → a feedback loop from geometry into meaning
- `charMode` branch → recursion
- global mutable `HP`, `TRACK`, `DBG` → explicit parameters
- measuring inside `getGroupMinPX()` → a measurement service after the boundary
- double layout per frame, pixel clamps inside layout, the 15-word cap

---

## 6. What the research established

| Finding | Source | Effect on VBerg |
|---|---|---|
| Focus of attention holds **~4 chunks (3–5)**, not 7 | Cowan 2001; Luck & Vogel 1997 | 3–5 groups in the FULL line |
| The limit applies to what must be **combined at once**, not what is visible; the screen acts as external memory | CLT element interactivity | Budget = one line of 3–5 groups, not "4 items on screen" |
| Chunks depend on expertise | Chase & Simon 1973; Ericsson & Kintsch 1995 | Chunks come from structure; user can override |
| Selection matters more than distortion | Furnas 1986, 2006 | S2–S4 run before S6 |
| Magnifying under the cursor hurts pointing | Gutwin 2002; Cockburn et al. 2008 | Discrete committed focus |
| Order-preserving layouts are more stable | Bederson, Shneiderman & Wattenberg 2002 | Ordinals, contiguous aggregates |
| Aggregates must represent and resolve to children; visual entity budget | Elmqvist & Fekete 2010 | S4 rules |
| Empty distant views disorient ("desert fog") | Jul & Furnas 1998 | Far field never empty: landmarks |
| Distant cues guide navigation (information scent) | Pirolli & Card 1999 | Aggregates and landmarks must carry scent |
| Landmarks, paths, districts build mental maps | Lynch 1960 | LANDMARK tier; aggregates as districts |
| Animated transitions help tracking | Heer & Robertson 2007 | S9 |
| Pixel stability ("mental map") has mixed evidence | Archambault & Purchase 2013 | Stabilize **order and identity** first, pixels last |
| Strongest spatial-memory result used **user-placed** positions | Robertson et al. 1998 (Data Mountain) | E1 is the top risk |
| Multitrees allow shared children | Furnas & Zacks 1994 | Ordinal lives on the arc |
| PDF structure is guessed; OOXML is explicit | PDF extraction literature; OOXML spec | Confidence flags on import |
| Fractional keys work solo; collaboration needs a list CRDT | Kleppmann et al. 2019; Fugue 2023 | Ordinal behind one interface |
| Dense relations: matrix beats node-link above ~20 nodes | Ghoniem, Fekete & Castagliola 2004 | Satellites / matrix, not lines |
| Multiple foci were never rigorously evaluated | Schaffer et al. 1996 | Max 1–2 warped levels |

**Stability priority (protect in this order):** identity → order → neighbours → landmarks → proportions → pixels.

---

## 7. Relationships

- Not drawn by default.
- Focused item: related nodes appear as **satellites** attached to it, with a jump action.
- Many relations: matrix view. Path questions only: node-link.
- Which edges show = deterministic ranking (type priority, distance, ordinal) under a budget.

---

## 8. Scale

| Items in a line | Behaviour |
|---|---|
| ≤ 40 | everything visible, Conserve mode |
| 40 – 500 | windowed, Extend mode, group markers |
| 500 – 50 000 | contiguous aggregates, DOI decides expansion |
| > 50 000 | never materialized; only the working set around the focus |

On a phone: same order, same groups, same landmarks, fewer items (a **subsequence**, never a reflow). `[test]`

---

## 9. Experiments (priority order)

| # | Question | Cheap method | Kill criterion |
|---|---|---|---|
| **E1** | Is a computed layout as memorable as a self-arranged one? | Static images; learn 30–50 items; re-find after 24 h: derived vs self-placed vs list | Derived no better than list → memory is not the justification |
| **E2** | How many groups in the FULL line before re-finding breaks? | Same line split into 2–8 groups | Flat up to 8 → the 3–5 rule is unnecessary |
| **E3** | Does compressed context keep orientation? | Focus + aggregates/landmarks vs plain list vs empty | No advantage → drop the far-field machinery |
| **E4** | Can semantic weights replace text width? | One strip, toggle, width slider | Labels illegible → weights from measurement |
| **E5** | How many warped levels at once? | Static nested lenses, 1–3 levels | 2 already worse than 1 → only one warped level |
| **E6** | Is the hill mnemonic or decorative? | Straight vs deterministic hill vs random hill | Straight ≈ hill → hill is style, not method |

---

## 10. Rules that must never be broken

1. No coordinate in the data.
2. Layout never reorders.
3. Nothing above the measurement boundary reads a font metric.
4. No randomness in geometry.
5. Only commands write data.
6. Aggregates cover contiguous ranges.
7. Anchors never move for labels.
8. Inferred structure is never shown as certain.
9. The user configures how a **type** is shown, never where an **instance** sits.
10. A derived place being memorable is a hypothesis until E1 says otherwise.

---

## 11. Worked example

Data: `Company → [Name, Departments, Employees, Projects, Revenue]`, `Departments → [IT, Finance, HR, Research]`, `IT → [Employees, Systems, Cybersecurity, Projects]`.

Focus = **IT**:
- **FULL** (on the hill): Employees · Systems · Cybersecurity · Projects, grouped by S3.
- **MEDIUM** (straight, labelled): Finance · HR · Research, in their order on either side of IT.
- **AGGREGATE**: `[Name]` and `[Employees – Revenue]` at the Company level, each keeping its interval.
- **LANDMARK**: Company.

Click **Cybersecurity** → it becomes FULL on its own hill (Assets · Risks · Controls · Incidents); IT's line drops to MEDIUM; Departments compresses to aggregates and landmarks. Nothing in the data changed. Nothing outside the bubble moved.

Add `Projects` under Company between `Employees` and `Revenue` → one new ordinal; the animation shows the shift; no layout code touched.

---

## 12. Decisions from George, 2026-10-09 (after the independent review VB-5)

These answer most of the review proposals (C1–C14). Where they differ from earlier sections, **this section wins.**

### 12.1 Why 3–5: places, not working memory
- 3–5 is about **places**: each group must have its own place on the screen, paper or board. The reviewers' critique targeted the working-memory justification; that is not the reason.
- **Dynamic, never forced.** The split is a starting point. The user plays with it.
- For 7 ordered items (days of the week) and 3–5 groups there are **50** possible splits (15 + 20 + 15). That is the playground: enough to play, small enough not to get lost.

### 12.2 Play, not just reading
- Memory comes from **interaction**: imagining the climb up the hill and the descent, and **playing** with the split.
- **Result order is fixed; build order is free.** The word / the week always ends up correct, but the learner may place pieces starting anywhere (middle, end). Like a child building a word from letters.
- Fits the serial-position effect: the middle of a list is remembered worst; the hill puts the middle at the peak.
- Planned practice mode: empty slots in fixed order on the hill, scrambled pieces, each piece fits only its own slot.
- Playing may also answer the E1 risk: the Data Mountain benefit came from the user's own act of arranging.

### 12.3 Three roles in every display
| Role | Does | When |
|---|---|---|
| **Algorithm** | reads data, builds threads, splits, draws, moves the cut line | always; no AI needed |
| **AI** | suggests the best **first** split by meaning (week 2–3–2, not 3–3–1; keep "identify analyze evaluate" together) | once, on first appearance; never changes data or order |
| **Person** | plays: moves boundaries, builds in any order | always; context never breaks |
- The first split is **saved as the home view**; the same content always opens the same way. A person's regroup becomes the new home.
- Regroup moves **boundaries only**; it never changes order. Reorder (changing meaning) is a separate, explicit action.

### 12.4 Threads and intersections (metro model)
- Thread = metro line, point = station, intersection = interchange station = hill peak. From the peak you switch to another thread.
- **Same idea → one point** (real interchange). **Same word, different meaning → two points** (like two "Centralstation" in different cities). A shared word alone never creates an intersection.
- Same point twice on one thread (loop) → each pass is a separate placement with its **own ID**.
- Who decides two points are the same: the computer **suggests** with both contexts shown; George **confirms**. Unconfirmed stays **separate**.

### 12.5 Tables, direction, entry points
- **A table is threads that cross** (see §1b). Rows vs columns is only screen direction.
- **Reading direction follows the thread's language** (see S7).
- Every thread has a start and an end (0 → 1). The whole database has no single start; you choose the entry. Cycles (PDCA) get a chosen start for display.
- **The table of contents is the door**: it is a thread that compresses a book onto one screen. Import starts by taking the TOC / headings as the first hill.

### 12.6 The cut line ("sea level")
- Imagine the hill as a mountain built from threads. A horizontal cut: **above** = on screen; **just below** = loaded in memory, ready when you move; **deep below** = in the database.
- Height = importance relative to focus (same idea as Furnas's degree-of-interest threshold, 1986).
- Moving the cut redraws the screen by itself. Lower water shows more, but always grouped into 3–5 places; higher water shows only the peak in full detail.

### 12.7 Still open from the review
C2 (concept / occurrence / assertion), C6 (lines with 1–2 items), C7 (Rule 7 wording), C8 (Rule 9 wording), C9 (char-count in weights), C10 (viewport in Invariant 4), C11 (showing uncertain structure), C12 (intersection count ≠ importance), C13 (E1 measures re-finding and recall separately).
