# Buddy: Lock In

> **If you lose focus, your pet falls asleep — and your money's on the line.**

Buddy is a gamified, multiplayer co-working platform where up to 4 users join a synchronized 3D study room. A dual-layer AI system tracks your focus in real time: MediaPipe monitors whether you're physically present, while Gemini Vision analyzes your screen to verify you're actually studying. Your 3D pet companion reacts to your behavior, your teammates feel the consequences of your distraction, and optionally — real SOL is at stake.

---

## Demo

https://www.youtube.com/watch?v=SI3UrrGbyZo
---

## The Problem

Study tools track what you consume, but nothing holds you accountable for actually engaging with material. You can stare at a textbook for an hour and retain nothing. Existing focus apps rely on honor systems or simple timers — they don't know if you're actually learning.

## The Solution

Buddy creates real consequences for distraction through three layers of accountability:

1. **Social Pressure** — Your distraction doesn't just affect you. When you lose focus, your *teammates'* pets lose energy. You're not letting yourself down — you're letting your friends down.
2. **Real Stakes** — In "Locked In" mode, players stake SOL. The most focused player takes the pot. Every glance at your phone is money walking away.
3. **Intelligent Tracking** — A dual-layer AI system catches you even if you're facing the screen but browsing Twitter. You can't fake focus.

---

## Architecture

### Dual-Layer Focus Detection

| Layer | Technology | What It Detects |
|---|---|---|
| **Physical Presence** | MediaPipe Face Landmarker | Head rotation >25° from center, user leaving frame |
| **Screen Content** | Gemini 1.5 Flash Vision | Whether on-screen content is study material or a distraction |

If MediaPipe says you're looking at the screen but Gemini Vision sees Twitter — you're caught. The system emits a "fake-focus" event, your pet reacts, and your teammates know.

### Screen-Aware Study Agent

Every 45 seconds, the app captures a screenshot of the user's shared screen and sends it to Gemini Vision for analysis. The system:

- Classifies content as study-related or distraction
- Extracts key concepts from educational material in real time
- Builds a timeline of what subjects you studied and when you got distracted
- Generates **comprehension quizzes from what you actually looked at** — not just the uploaded PDF
- Produces a personalized study report at session end with distraction patterns and review recommendations

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Component-based UI, fast builds |
| 3D Rendering | React Three Fiber | Animated .glb pet models in-browser |
| Real-Time Sync | Socket.io | Low-latency focus state, quiz events, screen analysis |
| Physical Focus | MediaPipe Face Landmarker | In-browser head pose estimation (no GPU server) |
| Screen Analysis | Gemini 1.5 Flash Vision | Real-time screen content classification + concept extraction |
| Quiz & Recap | Gemini 1.5 Flash | Quiz generation from PDFs + extracted concepts, session reports |
| Voice | ElevenLabs | Pet voice reactions + spoken quiz delivery |
| Blockchain | Solana (@solana/web3.js) + Phantom | Escrow betting + on-chain study reputation |
| Database | MongoDB Atlas | User accounts, pet progression, session history, leaderboards |
| Backend | Node.js + Express | Socket.io server, API orchestration |
| 3D Assets | Blender | Custom-modeled and animated pet companions |

---

## Core Features

### 3D Pet Companions
Custom-modeled low-poly pets built in Blender with three animation states: **Working**, **Idle**, and **Distracted/Sleeping**. Each pet species has a distinct ElevenLabs voice personality — the owl is dry and wise, the cat is sarcastic, the dog is enthusiastic. Voice lines fire on state changes: a disappointed sigh when your teammate loses focus, a cheer when you nail a quiz.

### Surprise Quizzes
Two types of quizzes test your knowledge:

- **Periodic quizzes** (every 5-10 min): Generated from the study guide PDF uploaded at session start. Your pet reads the question aloud. All players answer simultaneously.
- **Comprehension quizzes** (session end): Generated from concepts Gemini Vision extracted from your *actual screen activity*. These test whether you retained what you looked at — not just what was in the PDF.

### Solana Betting & Reputation

**Two modes:**
- **Casual** — No wallet needed. Points are just points.
- **Locked In** — All players stake SOL. Winner takes the pot.

**Why Solana, not Stripe:**
- **Atomic multi-player payouts.** A single transaction splits the pot to up to 4 wallets proportionally (1st: 50%, 2nd: 30%, 3rd: 20%, 4th: 0%). No partial failures, fractions of a cent in fees.
- **On-chain study reputation.** SPL tokens encode your study history on your wallet. Before entering a bet, you can verify an opponent's track record — like a poker player's public hand history. A database can be faked; a wallet history is verifiable and portable.
- **Payout + reputation in one atomic operation.** Stakes resolve and reputation tokens mint in a single indivisible transaction. This isn't Solana as a payment rail — it's Solana as a trustless competitive study protocol.

Final score: `0.8 × focus_percentage + 0.2 × quiz_accuracy`

### Session Recap & Study Report
At session end, Gemini analyzes your full study timeline and generates:
- Time breakdown by subject
- Distraction patterns and frequency
- Comprehension quiz on extracted concepts
- Personalized recommendations for what to review next

All session data persists in MongoDB — your pet levels up, your stats update, and the leaderboard reflects your history.

---

## Privacy

- **No webcam video is transmitted.** MediaPipe runs entirely in-browser. Only a boolean (`focused: true/false`) is sent over the network.
- **Screen capture is opt-in.** Users grant screen sharing permission via the browser's native `getDisplayMedia()` API. If denied, the system falls back to MediaPipe-only tracking.
- **Screenshots are processed server-side and not stored.** Gemini Vision analyzes the image and returns structured data. The raw screenshot is discarded immediately.

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster
- API keys: Gemini, ElevenLabs
- Solana CLI + devnet SOL (for betting features)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-team/buddy-lockin.git
cd buddy-lockin

# Install dependencies
cd server && npm install
cd ../client && npm install

# Configure environment
cp server/.env.example server/.env
# Add your API keys: GEMINI_API_KEY, ELEVENLABS_API_KEY,
# MONGODB_URI, SOLANA_PRIVATE_KEY
```

### Running

```bash
# Start backend
cd server && npm run dev

# Start frontend (separate terminal)
cd client && npm run dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini 1.5 Flash API key |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `SOLANA_PRIVATE_KEY` | Server escrow wallet keypair (devnet) |
| `PORT` | Server port (default: 3001) |

---

## How AI Is Used

Buddy uses AI at three distinct layers:

| Layer | Technology | Function |
|---|---|---|
| **Perception** | MediaPipe + Gemini Vision | Dual-layer focus detection — physical presence AND screen content analysis |
| **Cognition** | Gemini 1.5 Flash | Understanding study material, extracting concepts, generating adaptive quizzes, analyzing study patterns |
| **Interaction** | ElevenLabs | Giving AI a voice — pets speak, react, and tutor through audio |

---

## Team

| Member | Role |
|---|---|
| **Nikhil** | Backend, Blockchain, Screen Agent |
| **Abhay** | Frontend, 3D Integration, UX |
| **Kushagra** | 3D Modeling, Animation (Blender) |

---

## License

MIT

---

*Built at UF SASE Hackathon 2026*
