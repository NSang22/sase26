# Buddy! Lock In! — Full Project Spec

> **Tagline:** If you lose focus, your pet falls asleep — and your money's on the line.

---

## 1. Concept

A gamified co-working web app where up to four users join a synchronized 3D study room. Browser-based AI tracks each user's focus via webcam. Pets react to your behavior in real time — and optionally, real SOL is at stake. Surprise quizzes generated from uploaded study materials keep you honest. Persistent accounts mean your pet levels up across sessions.

---

## 2. Prize Targeting Strategy

| Prize | Hook |
|---|---|
| **Overall Best Gamification** | Pets, points, streaks, leveling, betting, leaderboards — the entire app is gamification |
| **Best Use of Solana** | Real-money escrow betting on focus sessions |
| **Best Use of Gemini API** | Quiz generation from study materials + session recap/study tips |
| **Best Use of Blender** | Custom-modeled and animated 3D pets |
| **Best Use of ElevenLabs** | Voiced pet reactions + spoken quiz questions |
| **Best Use of AI** | MediaPipe face tracking + Gemini LLM — two distinct AI layers |
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

1. **Social pressure.** Your distraction affects other players' pets, not just yours. If you zone out, their pets lose energy or get sad. You're not letting yourself down — you're impacting the whole room.
2. **Real money (optional).** In "Locked In" mode, up to 4 players escrow SOL. The winner (focus % + quiz accuracy) takes the pot. Every glance at your phone is money walking away.
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
- **Distracted/Sleeping:** Triggered when owner loses focus. visible to all players.

**Progression (persisted via MongoDB):**
- Pets earn XP from focus time and quiz performance.
- Leveling unlocks cosmetic changes (accessories, glow effects, new species).
- Session history is stored — users can see their focus trends over time.

**Voice & Audio (ElevenLabs + Pokémon SFX):**

Two audio layers:

1. **Pokémon SFX** — Each Pokémon species has its own sound-effect clips (bundled in `client/public/audio/pokemon/`). These play on state changes (focus lost, quiz correct, streak milestone, etc.) alongside a **text bubble** that appears over the pet with a short reaction message. No spoken dialogue from the pets — just cries/noises + text.

2. **Narrator (ElevenLabs)** — A single "Professor Oak"-style narrator voice powered by ElevenLabs TTS. Used for:
   - **Reading quiz questions aloud** — the narrator delivers each question so players can listen instead of just reading.
   - **Session recaps** — at session end, Gemini generates a recap summary and the narrator speaks it.
   - **Focus alerts** — e.g. "A trainer in the room lost focus!"
   - **Session start countdown** — "Trainers, lock in!"

Only one ElevenLabs voice ID is needed (`ELEVENLABS_VOICE_ID` in `.env`).

### 4.4 Surprise Quizzes (Gemini)

- **Source:** Host uploads a PDF or text study guide during the waiting room phase. Parsed server-side via `pdf-parse`.
- **Generation:** Gemini 1.5 Flash generates multiple-choice quiz JSON from the extracted text. Pre-generate a bank of 10-15 questions at session start, don't call the API mid-session.
- **Trigger:** Server emits a quiz event every 5-10 minutes (randomized interval).
- **UX:** 2D overlay on the 3D scene. All players answer the same question simultaneously. Narrator reads the question aloud via ElevenLabs.
- **Scoring:** Correct answer + speed bonus. Results factor into final session score.

### 4.5 Solana Betting

**Two modes:**

| Mode | Description |
|---|---|
| **Casual** | No wallet needed. Points are just points. Full functionality minus the money. |
| **Locked In** | Up to 4 players connect Phantom wallets and stake SOL into an escrow program. |

**Betting flow:**
1. Host creates room and sets stake amount (e.g., 0.1 SOL).
2. Up to 4 players connect Phantom wallets in the waiting room.
3. All players send SOL to a server-controlled wallet. Session cannot start until all transactions confirm.
4. During session, staked amount is visible on screen at all times.
5. On session end, server calculates winner via weighted score: `0.8 * focus_percentage + 0.2 * quiz_accuracy`. Focus is the core metric — quizzes are bonus reinforcement, not the main event.
6. Server sends funds from the held wallet to the winner's address.
7. Ties -> funds returned to all tied players (or split evenly by rule).

**Note:** This is a server-managed escrow (centralized). Production version would use an Anchor on-chain program for trustless resolution. For a hackathon MVP, the demo is identical and saves hours of Rust development.

**Demo strategy:** Show casual mode first to explain the mechanics. Then reveal "but what if the stakes were real?" and demo the wallet flow. That's the pitch moment.

### 4.6 Persistence (MongoDB Atlas)

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
1. Host uploads study material (PDF/text).
2. Up to 4 players ready up.
3. If "Locked In" mode: all players connect Phantom wallets and approve escrow.
4. System pre-generates quiz bank from uploaded material (Gemini).
5. System pre-generates voice lines for quiz questions (ElevenLabs).

### 5.3 Session
1. HTML UI fades out, 3D canvas mounts.
2. Webcam calibration (3 seconds).
3. Timer starts. Pets begin in "Working" state.
4. Focus tracking runs continuously. State changes sync via Socket.io.
5. Quizzes fire every 5-10 minutes. Pet reads question aloud.
6. Points accumulate in real time, visible to all players.

### 5.4 Session End
1. Timer expires or all players end manually.
2. Recap screen: focus time %, quiz accuracy, total points.
3. If betting: escrow resolves, funds transfer shown on screen.
4. XP awarded, pet progression updated in MongoDB.
5. Session saved to history. Leaderboard updated.

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
- Waiting room UI, quiz overlay, leaderboard/recap screens.
- Phantom wallet connect integration (frontend side).
- ElevenLabs audio playback (triggered on events).
- MediaPipe integration (runs client-side, emits focus boolean).

### Person C — Backend + Blockchain
- Node.js + Express + Socket.io server.
- Room management (create/join, ready states).
- Gemini API integration: PDF parsing → quiz generation.
- ElevenLabs API: pre-generate voice clips for quiz questions + pet reactions.
- MongoDB Atlas: user accounts, session storage, leaderboard queries.
- Solana integration (@solana/web3.js): server-managed wallet, receive stakes, send payouts to winner.

---

## 7. Asset Requirements

| Asset | Source | Notes |
|---|---|---|
| Pet models (.glb) | Custom (Blender) | 2-3 species, 3 animation clips each |
| Room/desk model (.glb) | Custom (Blender) or Poly.pizza | Cozy, up to four-seat setup |
| Pet voice lines | ElevenLabs API | ~15-20 clips per species, pre-generated |
| Quiz audio | ElevenLabs API | Generated per session from quiz text |

---

## 8. Demo Script (3-Minute Pitch)

**[0:00-0:30] Hook.** "What if studying actually had consequences? Meet Buddy." Show the landing page. Up to 4 users join a room.

**[0:30-1:00] The Core Loop.** Show the 3D room, up to four pets studying. One player looks away -> other players' pets react, the voice line fires. "Your focus doesn't just affect you -> it affects the whole room."

**[1:00-1:30] Quizzes.** A surprise quiz pops up. The pet reads it aloud. All players answer. Points update live.

**[1:30-2:00] The Stakes.** "But what if the stakes were real?" Show Phantom wallet connect. Show the escrow. "Now every distraction costs you money."

**[2:00-2:30] Progression.** Show the MongoDB-backed profile. Pet level, session history, leaderboard. "This isn't a one-time gimmick — your pet grows with you."

**[2:30-3:00] Tech + Close.** Quick tech stack slide: MediaPipe, Gemini, ElevenLabs, Solana, Blender, MongoDB. "Six technologies, one seamless experience. Buddy: Lock In."

---

## 9. Risk Mitigation

| Risk | Mitigation |
|---|---|
| .glb animation pipeline issues | Agree on model contract (scale, clip names, orientation) in hour 1. Placeholder cube for early frontend dev. |
| Gemini returns malformed quiz JSON | Validate and retry with stricter prompt. Pre-generate full quiz bank at session start, not on-the-fly. |
| Solana transfer bugs during demo | Have casual mode as fallback. Demo with devnet SOL and pre-funded wallets. |
| ElevenLabs rate limits | Pre-generate all voice lines during waiting room phase. Cache aggressively. |
| Two-laptop demo failure | Support same-machine demo: two browser tabs, one with webcam, one simulated. |
| MongoDB connection issues | Pre-seed data locally. Have a local fallback or show screenshots of leaderboard if Atlas is down. |

