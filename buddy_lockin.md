# Buddy: Lock In — Full Project Spec

> **Tagline:** If you lose focus, your pet falls asleep — and your money's on the line.

---

## 1. Concept

A gamified co-working web app where up to 4 users join a synchronized 3D study room. Everyone studies their own material — a dual-layer AI system tracks physical focus via webcam AND analyzes screen content to verify you're actually studying. Personalized quizzes are generated from what each player is actually looking at, difficulty-normalized across subjects so scoring is fair. Pets react to your behavior in real time — and optionally, real SOL is at stake. Persistent accounts mean your pet levels up across sessions.

---

## 2. Prize Targeting Strategy

| Prize | Hook |
|---|---|
| **Overall Best Gamification** | Pets, points, streaks, leveling, betting, leaderboards — the entire app is gamification |
| **Best Use of Solana** | Real-money escrow betting on focus sessions |
| **Best Use of Gemini API** | Gemini Vision for real-time screen analysis + concept extraction. Gemini Flash for personalized quiz generation with Bloom's taxonomy normalization + session study reports. |
| **Best Use of Blender** | Custom-modeled and animated 3D pets |
| **Best Use of ElevenLabs** | Voiced pet reactions + spoken quiz questions |
| **Best Use of AI** | Three-layer AI: perception (MediaPipe), cognition (Gemini Vision + Flash), interaction (ElevenLabs). Dual-layer focus detection + cross-subject difficulty normalization via Bloom's taxonomy. |
| **Best Overall** | Full-stack, polished, multi-tech integration with a clear user story |

---

## 3. Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Frontend | React + Vite | Component-based UI, fast builds |
| 3D Rendering | React Three Fiber (R3F) | Mount and animate .glb pet models in-browser |
| Real-Time Sync | Socket.io | Low-latency focus state + quiz event syncing |
| Vision AI | MediaPipe Face Landmarker | In-browser head pose estimation (pitch/yaw) |
| LLM | Gemini 1.5 Flash | Quiz generation, session recaps, study tips |
| Voice | ElevenLabs API | Pet voice lines + spoken quiz delivery |
| Blockchain | Solana (@solana/web3.js) + Phantom Wallet | Server-managed escrow betting |
| Database | MongoDB Atlas | User accounts, pet progression, session history, leaderboards |
| Backend | Node.js + Express | Socket.io server, API glue, LLM/ElevenLabs calls |

---

## 4. Core Mechanics

### 4.1 The Accountability Loop (Why You Care)

The original problem: why does anyone care if a virtual pet falls asleep?

**Answer: three layers of stakes.**

1. **Social pressure.** Your distraction affects your *partner's* pet, not just yours. If you zone out, their pet loses energy or gets sad. You're not letting yourself down — you're screwing someone else over.
2. **Real money (optional).** In "Locked In" mode, both players escrow SOL. The winner (focus % + quiz accuracy) takes the pot. Every glance at your phone is money walking away.
3. **Persistent progression.** Your pet levels up across sessions. Focus streaks unlock cosmetics, new pet species, titles. You've invested hours into this pet — you're not going to let it down now.

### 4.2 Focus Tracking (MediaPipe)

- **Calibration:** 3-second webcam check at session start to establish "center" gaze.
- **Detection:** Head rotation >25° from center OR user disappears from frame → `isLockedIn = false`.
- **Data sent over socket:** Only a boolean `{ focused: true/false }`. No video leaves the client. Ever.
- **Visual cue:** A neon "Lock-In" ring glows under the pet when focused. Dims/dies when distracted.

### 4.3 Pet System

Each pet has three animation states:
- **Working:** Happily studying, small idle movements.
- **Idle:** Neutral, waiting.
- **Distracted/Sleeping:** Triggered when owner loses focus. Visible to both players.

**Progression (persisted via MongoDB):**
- Pets earn XP from focus time and quiz performance.
- Leveling unlocks cosmetic changes (accessories, glow effects, new species).
- Session history is stored — users can see their focus trends over time.

**Voice (ElevenLabs):**
- Each pet species has a distinct voice personality (owl = dry/wise, cat = sarcastic, dog = enthusiastic).
- Pre-generated voice lines triggered on state changes only (not continuous):
  - Partner loses focus → disappointed reaction
  - Quiz answered correctly → celebration
  - Focus streak milestone → hype callout
  - Session start/end → greeting/recap
- **Quiz questions read aloud** by the pet — acts as a tutor, not a popup.
- Keep lines sparse. Reactions fire on state *changes*, not continuously.

### 4.4 Study Modes

**Two modes:**

| Mode | Description |
|---|---|
| **Individual (Default)** | Everyone studies their own material. The screen agent watches what each person is learning and generates personalized quizzes from their actual screen content. |
| **Collaborative (Stretch Goal)** | Host uploads shared study material (PDF/text). All players get the same quizzes from the uploaded content. Traditional shared-study mode. Only build if time allows. |

### 4.5 Screen-Aware Study Agent

The frontend captures a screenshot of the user's shared screen every 45 seconds via `getDisplayMedia()` and sends it to the server as a base64 JPEG (quality 0.6).

**Server-side pipeline per capture:**
1. Send screenshot to Gemini 1.5 Flash Vision: classify as study vs distraction, identify subject, extract up to 5 key concepts.
2. Store results on the player object: accumulate a `concepts` array and a `timeline` array (timestamp + subject + is_studying boolean).
3. If MediaPipe says `focused=true` but screen analysis says `is_studying=false`, override focus to false and emit a "fake-focus" event. The system catches you even if you're staring at Twitter while facing your webcam.
4. Optionally, also extract `document.body.innerText` from the active tab as supplementary context for more accurate concept identification (lightweight DOM text extraction alongside the screenshot).

**If user denies screen sharing permission:** Fall back to MediaPipe-only focus tracking. Note in the UI that screen analysis is disabled. Quizzes won't generate for that player — they compete on focus score only.

### 4.6 Personalized Quiz Generation (Individual Mode)

**The core problem:** Four people studying four different subjects need quizzes of comparable difficulty so the scoring is fair.

**The approach — Bloom's Taxonomy Difficulty Normalization:**
- Every quiz round, the server picks a Bloom's level for that round (recall, comprehension, application, analysis). All players get the same level.
- For each player, Gemini generates a question at that Bloom's level from that player's extracted concepts.
- Example: At "application" level, the orgo student gets a reaction mechanism application question while the linear algebra student gets an eigenvalue application problem. Different subjects, same cognitive demand.

**Quiz flow:**
1. Server accumulates concepts from each player's screen captures over time.
2. Every 5-10 minutes (randomized), server triggers a quiz round.
3. For each player, server sends their accumulated concepts to Gemini with the prompt: "Generate 1 multiple-choice question at [Bloom's level] difficulty from these concepts: [concepts]. Return JSON: { question, options (4), correct_answer_index, explanation, bloom_level, source_concept }."
4. Each player receives their own personalized question simultaneously. Pet reads it aloud via ElevenLabs.
5. All players answer at the same time. Speed bonus applies.

**Fallback:** If difficulty normalization isn't ready, just generate questions from each player's concepts independently without the Bloom's leveling. The feature still works — it's just less fair for betting. Explain the Bloom's framework verbally in the pitch even if it's not fully implemented.

**Session-end comprehension quiz:**
- At session end, Gemini generates 5 additional questions from each player's full concept history — testing whether they retained what they actually looked at.
- These are separate from the periodic quizzes and test deeper comprehension.

### 4.7 Collaborative Mode (Stretch Goal)

- Host uploads a PDF or text study guide during the waiting room phase. Parsed server-side via `pdf-parse`.
- Gemini pre-generates a bank of 10-15 questions from the uploaded material at session start.
- All players get the same questions simultaneously.
- This is the simpler mode — only build if individual mode is solid and time allows.

### 4.8 Scoring System

**Composite score from four metrics:**

| Metric | Weight | Description |
|---|---|---|
| **Focus Score** | 0.50 | Percentage of session time in focused state (both MediaPipe + screen content) |
| **Quiz Accuracy** | 0.20 | Percentage of quiz questions answered correctly |
| **Response Time** | 0.15 | Average time to answer questions, normalized against a baseline (faster = better) |
| **Consistency** | 0.15 | Low variance in focus = higher score. Steady 80% beats alternating 100%/0%. |

`total_score = 0.50 * focus + 0.20 * accuracy + 0.15 * response_time_score + 0.15 * consistency`

This gives a richer leaderboard with multiple metrics to display during the demo — not just a single number.

**Metrics tracked per player during session:**
- `total_focused_ms` / `total_session_ms` → focus percentage
- `screen_study_ms` / `total_session_ms` → screen-verified study percentage
- `questions_correct` / `questions_total` → quiz accuracy
- `answer_times[]` → average response time
- `focus_state_changes[]` → calculate variance for consistency
- `concepts_extracted[]` → subjects studied
- `distraction_log[]` → what they got distracted by and when

### 4.9 Solana Betting

**Two modes:**

| Mode | Description |
|---|---|
| **Casual** | No wallet needed. Points are just points. Full functionality minus the money. |
| **Locked In** | Both players connect Phantom wallets and stake SOL into an escrow program. |

**Betting flow:**
1. Host creates room and sets stake amount (e.g., 0.1 SOL).
2. All players connect Phantom wallets in the waiting room. Before betting, players can see each other's on-chain study reputation (focus hours, win rate, XP tokens held) to make informed decisions about whether to enter.
3. All players send SOL to a server-controlled wallet. Session cannot start until all transactions confirm.
4. During session, staked amount and pot total are visible on screen at all times.
5. On session end, server calculates rankings via the composite score: `0.50 * focus + 0.20 * quiz_accuracy + 0.15 * response_time_score + 0.15 * consistency`.
6. Server executes a **single atomic Solana transaction** that does everything at once:
   - Splits the pot proportionally by ranking (e.g., 1st: 50%, 2nd: 30%, 3rd: 20%, 4th: 0%).
   - Mints SPL tokens to all participants: a winner token to 1st place, and XP tokens to everyone proportional to their focus score.
   - If the transaction fails, nobody gets paid and no tokens mint — no partial state.
7. Ties between top scorers → equal split of their combined share.

**Why Solana and not Stripe:**
- **Atomic multi-player payouts.** One transaction splits the pot to 4 wallets proportionally. No partial failures, fractions of a cent in fees. Stripe would need 4 separate API calls with 4 processing fees.
- **On-chain study reputation.** SPL tokens encode your study history (focus hours, wins, XP) on your wallet. Before entering a bet, you can verify an opponent's track record — like a poker player's public hand history. A database can be faked; a wallet history is verifiable and portable across platforms.
- **Single atomic transaction = payout + reputation mint.** Stakes resolve and reputation updates in one indivisible operation. This isn't using Solana as a payment rail — it's using it as a trustless competitive study protocol.

**Note:** Server-managed escrow for the MVP. Production version would use an Anchor on-chain program for fully trustless resolution.

**Demo strategy:** Show casual mode first to explain the mechanics. Then reveal "but what if the stakes were real?" and demo the wallet flow. That's the pitch moment.

### 4.10 Persistence (MongoDB Atlas)

**Collections:**
- `users` — username, wallet address (optional), pet species, pet level, XP, cosmetics unlocked
- `sessions` — room code, participants, start/end time, focus scores, quiz results, winner, stake amount
- `leaderboard` — aggregated stats: total focus time, win rate, quiz accuracy, streaks

**Why this matters for judging:** It lets you show a leaderboard with real historical data during the demo. Pre-seed it with test data from practice sessions so it doesn't look empty.

---

## 5. User Flow

### 5.1 Entry
1. Landing page → Sign up / Log in (simple username + password, or wallet-based auth).
2. Create or join a room via Room Code.
3. Select pet species (first time) or see your existing pet.

### 5.2 Waiting Room
1. All players ready up.
2. If "Locked In" mode: all connect Phantom wallets and approve escrow.
3. If Collaborative mode: host uploads study material (PDF/text), system pre-generates quiz bank (Gemini).
4. System pre-generates pet voice lines (ElevenLabs).

### 5.3 Session
1. HTML UI fades out, 3D canvas mounts.
2. Webcam calibration (3 seconds).
3. Screen share permission requested (for screen-aware agent). Falls back to MediaPipe-only if denied.
4. Timer starts. Pets begin in "Working" state.
5. Focus tracking runs continuously (dual-layer: MediaPipe + screen content). State changes sync via Socket.io.
6. Screen agent captures every 45 seconds, extracts concepts, builds study timeline.
7. Personalized quizzes fire every 5-10 minutes — each player gets a question from their own material, difficulty-normalized via Bloom's taxonomy.
8. Pet reads question aloud. All players answer simultaneously.
9. Composite scores accumulate in real time, visible to all players.

### 5.4 Session End
1. Timer expires or majority vote to end.
2. Session-end comprehension quiz: 5 questions per player from their full extracted concept history.
3. Gemini generates personalized study report per player: time breakdown by subject, distraction patterns, recommendations for what to review.
4. Recap screen: composite score breakdown (focus, accuracy, response time, consistency), study timeline, quiz results.
5. If betting: atomic Solana transaction — pot split + reputation tokens minted.
6. XP awarded, pet progression updated in MongoDB.
7. Session saved to history. Leaderboard updated.

---

## 6. Team Split (3 People, 24 Hours)

### Person A — Blender + Assets
- Model 2-3 pet species (low-poly, expressive).
- Model the room/desk environment.
- Rig and animate 3 states per pet: Working, Idle, Distracted/Sleeping.
- Export as .glb with named animation clips.
- **Hour 1 deliverable:** Export a placeholder cube with 3 named animation clips so frontend can build against the contract. Agree on scale, orientation, and clip names.

### Person B — Frontend + 3D + UX
- React + Vite scaffold.
- R3F scene: mount room, mount pets, wire animation states to focus status.
- Waiting room UI, quiz overlay, leaderboard/recap screens, study report display.
- Screen capture integration: `getDisplayMedia()` → canvas → base64 JPEG → Socket.io emit every 45 seconds. Handle permission denial gracefully.
- Display detected subject pill/badge ("Studying: Organic Chemistry" / "Distracted: Twitter").
- Phantom wallet connect integration (frontend side).
- ElevenLabs audio playback (triggered on events).
- MediaPipe integration (runs client-side, emits focus boolean).

### Person C — Backend + Blockchain + Screen Agent
- Node.js + Express + Socket.io server.
- Room management (create/join, ready states, up to 4 players).
- Screen agent: receive screenshots via Socket.io, send to Gemini Vision for content classification + concept extraction, build per-player study timelines, detect fake-focus.
- Personalized quiz generation: accumulate concepts per player, generate difficulty-normalized questions using Bloom's taxonomy levels via Gemini.
- Session-end comprehension quiz + study report generation via Gemini.
- ElevenLabs API: pre-generate voice clips for quiz questions + pet reactions.
- MongoDB Atlas: user accounts, session storage, leaderboard queries, study reports.
- Solana integration (@solana/web3.js): server-managed wallet, receive stakes, atomic payout + SPL token minting.

---

## 7. Asset Requirements

| Asset | Source | Notes |
|---|---|---|
| Pet models (.glb) | Custom (Blender) | 2-3 species, 3 animation clips each |
| Room/desk model (.glb) | Custom (Blender) or Poly.pizza | Cozy, two-seat setup |
| Pet voice lines | ElevenLabs API | ~15-20 clips per species, pre-generated |
| Quiz audio | ElevenLabs API | Generated per session from quiz text |

---

## 8. Demo Script (3-Minute Pitch)

**[0:00-0:30] Hook.** "Study tools track what you consume. Nothing tracks whether you're actually learning. Meet Buddy." Show the landing page. Four users join a room — each studying different subjects.

**[0:30-1:00] The Core Loop.** Show the 3D room, four pets studying. One player switches to Instagram — their pet reacts, voice line fires, teammates see the distraction. "Our AI doesn't just check if you're facing the screen. It knows what's on your screen."

**[1:00-1:30] Personalized Quizzes.** Quiz round fires. Each player gets a different question from their own material, at the same Bloom's taxonomy difficulty level. "Same cognitive demand, different subjects. The playing field is level."

**[1:30-2:00] The Stakes.** "But what if the stakes were real?" Show Phantom wallet connect. Show the escrow. Pot splits proportionally. Reputation tokens mint. "One atomic Solana transaction — payout and reputation in a single operation."

**[2:00-2:30] Session Recap.** Show the study report: time breakdown by subject, distraction log, comprehension quiz results, Gemini's personalized review recommendations. Show the pet leveling up, the leaderboard. "Your growth persists across sessions."

**[2:30-3:00] Tech + Close.** "AI at three layers — perception with MediaPipe, cognition with Gemini Vision and Flash, interaction with ElevenLabs. Plus Solana as a trustless study protocol, Blender for custom 3D companions, and MongoDB for persistence. Buddy: Lock In."

---

## 9. Risk Mitigation

| Risk | Mitigation |
|---|---|
| .glb animation pipeline issues | Agree on model contract (scale, clip names, orientation) in hour 1. Placeholder cube for early frontend dev. |
| Gemini returns malformed quiz JSON | Validate and retry with stricter prompt. Catch and skip bad questions. |
| Difficulty normalization isn't fair | Bloom's taxonomy is the framework, but fallback to unnormalized per-player quizzes if it's not working. Explain the framework verbally in the pitch. |
| Screen capture denied by user | Graceful fallback to MediaPipe-only. Player competes on focus score only, no quizzes generated for them. |
| Gemini Vision rate limits from 4 players × captures every 45s | Stagger captures across players (player 1 at 0s, player 2 at 11s, player 3 at 22s, player 4 at 33s). Increase interval to 60s if hitting limits. |
| Solana transfer bugs during demo | Have casual mode as fallback. Demo with devnet SOL and pre-funded wallets. |
| ElevenLabs rate limits | Pre-generate pet voice lines at startup. Generate quiz audio on-demand but cache aggressively. |
| Multi-laptop demo failure | Support same-machine demo: multiple browser tabs, one with webcam, others simulated. |
| MongoDB connection issues | Pre-seed data locally. Have a local fallback or show screenshots of leaderboard if Atlas is down. |