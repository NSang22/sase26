import { useState, useEffect, useRef, useCallback } from "react";
import { useGameStore } from "../../store/gameStore.js";
import { socket } from "../../lib/socket.js";

// Pixel art sprite data - each Pokemon drawn on canvas
const POKEMON_SPRITES = {
  pikachu: {
    color: "#F8D030",
    accent: "#B8860B",
    cheeks: "#E85050",
    size: 32,
    name: "Pikachu",
  },
  eevee: {
    color: "#C08850",
    accent: "#F8E8C0",
    cheeks: "#C08850",
    size: 32,
    name: "Eevee",
  },
  bulbasaur: {
    color: "#68B868",
    accent: "#48D0B0",
    cheeks: "#68B868",
    size: 32,
    name: "Bulbasaur",
  },
  squirtle: {
    color: "#58A8E8",
    accent: "#C09858",
    cheeks: "#58A8E8",
    size: 32,
    name: "Squirtle",
  },
  charmander: {
    color: "#F08830",
    accent: "#F8D030",
    cheeks: "#F08830",
    size: 32,
    name: "Charmander",
  },
};

// Pixel art renderer for a simple Pokemon-like sprite
function drawPixelPokemon(ctx, x, y, pokemon, frame, scale = 3) {
  const p = POKEMON_SPRITES[pokemon];
  const s = scale;
  const bounce = Math.sin(frame * 0.08) * 2 * s;
  const blink = Math.floor(frame / 40) % 8 === 0;
  const yOff = y + bounce;

  ctx.imageSmoothingEnabled = false;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x + 8 * s, y + 18 * s, 6 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = p.color;
  fillRect(ctx, x + 3 * s, yOff + 6 * s, 10 * s, 10 * s);

  // Head
  ctx.fillStyle = p.color;
  fillRect(ctx, x + 2 * s, yOff + 1 * s, 12 * s, 8 * s);

  // Ears/features based on Pokemon
  if (pokemon === "pikachu") {
    ctx.fillStyle = p.color;
    fillRect(ctx, x + 1 * s, yOff - 3 * s, 2 * s, 5 * s);
    fillRect(ctx, x + 13 * s, yOff - 3 * s, 2 * s, 5 * s);
    ctx.fillStyle = "#282828";
    fillRect(ctx, x + 1 * s, yOff - 3 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 13 * s, yOff - 3 * s, 2 * s, 2 * s);
    // Cheeks
    ctx.fillStyle = p.cheeks;
    fillRect(ctx, x + 1 * s, yOff + 5 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 13 * s, yOff + 5 * s, 2 * s, 2 * s);
    // Tail
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 14 * s, yOff + 4 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 16 * s, yOff + 2 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 16 * s, yOff + 0 * s, 3 * s, 2 * s);
  } else if (pokemon === "eevee") {
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 0 * s, yOff - 2 * s, 3 * s, 6 * s);
    fillRect(ctx, x + 13 * s, yOff - 2 * s, 3 * s, 6 * s);
    // Collar fluff
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 2 * s, yOff + 7 * s, 12 * s, 3 * s);
    // Tail
    fillRect(ctx, x + 14 * s, yOff + 4 * s, 3 * s, 6 * s);
    fillRect(ctx, x + 16 * s, yOff + 2 * s, 2 * s, 4 * s);
  } else if (pokemon === "bulbasaur") {
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 4 * s, yOff - 2 * s, 8 * s, 4 * s);
    fillRect(ctx, x + 5 * s, yOff - 4 * s, 6 * s, 3 * s);
    // Spots
    ctx.fillStyle = "#48A068";
    fillRect(ctx, x + 4 * s, yOff + 8 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 10 * s, yOff + 9 * s, 2 * s, 2 * s);
  } else if (pokemon === "squirtle") {
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 3 * s, yOff + 8 * s, 10 * s, 8 * s);
    // Shell pattern
    ctx.fillStyle = "#805028";
    fillRect(ctx, x + 5 * s, yOff + 10 * s, 6 * s, 4 * s);
    // Tail
    ctx.fillStyle = "#58A8E8";
    fillRect(ctx, x + 14 * s, yOff + 10 * s, 3 * s, 3 * s);
    fillRect(ctx, x + 16 * s, yOff + 8 * s, 2 * s, 3 * s);
  } else if (pokemon === "charmander") {
    // Tail flame
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 14 * s, yOff + 8 * s, 2 * s, 4 * s);
    ctx.fillStyle = "#F85030";
    fillRect(ctx, x + 15 * s, yOff + 6 * s, 3 * s, 4 * s);
    ctx.fillStyle = "#F8D030";
    fillRect(ctx, x + 16 * s, yOff + 4 * s + Math.sin(frame * 0.2) * s, 2 * s, 3 * s);
    // Belly
    ctx.fillStyle = "#F8E880";
    fillRect(ctx, x + 5 * s, yOff + 8 * s, 6 * s, 6 * s);
  }

  // Eyes
  if (!blink) {
    ctx.fillStyle = "#282828";
    fillRect(ctx, x + 4 * s, yOff + 3 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 10 * s, yOff + 3 * s, 2 * s, 2 * s);
    // Eye shine
    ctx.fillStyle = "#FFFFFF";
    fillRect(ctx, x + 4 * s, yOff + 3 * s, 1 * s, 1 * s);
    fillRect(ctx, x + 10 * s, yOff + 3 * s, 1 * s, 1 * s);
  } else {
    ctx.fillStyle = "#282828";
    fillRect(ctx, x + 4 * s, yOff + 4 * s, 2 * s, 1 * s);
    fillRect(ctx, x + 10 * s, yOff + 4 * s, 2 * s, 1 * s);
  }

  // Mouth - tiny smile
  ctx.fillStyle = "#282828";
  fillRect(ctx, x + 7 * s, yOff + 6 * s, 2 * s, 1 * s);

  // Feet
  ctx.fillStyle = p.color;
  fillRect(ctx, x + 3 * s, yOff + 14 * s, 3 * s, 2 * s);
  fillRect(ctx, x + 10 * s, yOff + 14 * s, 3 * s, 2 * s);
}

function fillRect(ctx, x, y, w, h) {
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Floating pixel particles
function drawParticle(ctx, x, y, size, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  fillRect(ctx, x, y, size, size);
  ctx.globalAlpha = 1;
}

// Stars background
function drawStar(ctx, x, y, frame, seed) {
  const twinkle = Math.sin(frame * 0.03 + seed * 7) * 0.5 + 0.5;
  const size = seed > 0.7 ? 3 : seed > 0.4 ? 2 : 1;
  ctx.globalAlpha = twinkle * 0.8 + 0.2;
  ctx.fillStyle = seed > 0.8 ? "#F8D030" : seed > 0.5 ? "#A8D8F8" : "#FFFFFF";
  fillRect(ctx, x, y, size, size);
  ctx.globalAlpha = 1;
}

// Ground tiles
function drawGround(ctx, width, height, frame) {
  const tileSize = 24;
  const groundY = height - 100;

  // Grass base
  ctx.fillStyle = "#2D5A1E";
  ctx.fillRect(0, groundY, width, 100);

  // Grass pattern
  for (let x = 0; x < width; x += tileSize) {
    ctx.fillStyle = x % (tileSize * 2) === 0 ? "#347A24" : "#2D6A1E";
    ctx.fillRect(x, groundY, tileSize, 4);

    // Grass blades
    if (Math.sin(x * 0.5 + frame * 0.02) > 0.3) {
      ctx.fillStyle = "#4CAF50";
      const bladeOffset = Math.sin(frame * 0.05 + x * 0.1) * 2;
      fillRect(ctx, x + 4 + bladeOffset, groundY - 4, 2, 6);
      fillRect(ctx, x + 14 + bladeOffset * 0.7, groundY - 3, 2, 5);
    }
  }

  // Path
  ctx.fillStyle = "#8B7355";
  ctx.fillRect(0, groundY + 20, width, 30);
  ctx.fillStyle = "#9B8365";
  for (let x = 0; x < width; x += 32) {
    ctx.fillRect(x + 2, groundY + 22, 28, 26);
  }
  ctx.fillStyle = "#7B6345";
  for (let x = 0; x < width; x += 32) {
    ctx.fillRect(x, groundY + 20, 32, 2);
  }
}

export default function BuddyLockIn() {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const starsRef = useRef([]);
  const particlesRef = useRef([]);
  const [screen, setScreen] = useState("landing"); // landing, makeRoom, joinRoom
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const [transitionPhase, setTransitionPhase] = useState("idle"); // idle | closing | pokeball | opening
  const [username, setUsername] = useState("");
  const [copied, setCopied] = useState(false);
  const { setPhase, setRoom, setUser } = useGameStore();

  // Generate room code
  const generateCode = useCallback(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }, []);

  // Init stars
  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * 1200,
        y: Math.random() * 500,
        seed: Math.random(),
      });
    }
    starsRef.current = stars;

    // Init floating particles
    const particles = [];
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: Math.random() * 1200,
        y: Math.random() * 600,
        vy: -0.3 - Math.random() * 0.5,
        size: 2 + Math.random() * 3,
        color: ["#F8D030", "#58A8E8", "#68B868", "#F08830", "#E85050"][Math.floor(Math.random() * 5)],
        alpha: 0.3 + Math.random() * 0.4,
        life: Math.random() * 200,
      });
    }
    particlesRef.current = particles;
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const pokemonPositions = [
      { type: "pikachu", x: 80, baseY: 0 },
      { type: "eevee", x: 220, baseY: 0 },
      { type: "bulbasaur", x: 800, baseY: 0 },
      { type: "squirtle", x: 940, baseY: 0 },
      { type: "charmander", x: 520, baseY: 0 },
    ];

    const render = () => {
      const frame = frameRef.current++;
      const w = canvas.width;
      const h = canvas.height;

      // Night sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0A0A2E");
      grad.addColorStop(0.4, "#16163A");
      grad.addColorStop(0.7, "#1A2847");
      grad.addColorStop(1, "#1E3A20");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Stars
      starsRef.current.forEach((star) => {
        drawStar(ctx, star.x, star.y, frame, star.seed);
      });

      // Moon
      ctx.fillStyle = "#FFFDE8";
      ctx.beginPath();
      ctx.arc(950, 80, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0A0A2E";
      ctx.beginPath();
      ctx.arc(940, 75, 30, 0, Math.PI * 2);
      ctx.fill();

      // Floating particles
      particlesRef.current.forEach((p) => {
        p.y += p.vy;
        p.x += Math.sin(frame * 0.02 + p.life) * 0.3;
        p.life++;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        drawParticle(ctx, p.x, p.y, p.size, p.color, p.alpha * (Math.sin(p.life * 0.03) * 0.3 + 0.7));
      });

      // Ground
      drawGround(ctx, w, h, frame);

      // Draw Pokemon on the ground
      const groundY = h - 100;
      pokemonPositions.forEach((pkmn, i) => {
        const individualBounce = Math.sin(frame * 0.06 + i * 1.5);
        const yPos = groundY - 52 + individualBounce * 3;
        drawPixelPokemon(ctx, pkmn.x, yPos, pkmn.type, frame + i * 20, 3);

        // Name tag
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(
          POKEMON_SPRITES[pkmn.type].name,
          pkmn.x + 24,
          yPos - 8
        );
      });

      // Pokeball decorations scattered on ground
      const pokeballPositions = [
        { x: 400, y: groundY + 8 },
        { x: 650, y: groundY + 12 },
        { x: 150, y: groundY + 10 },
      ];
      pokeballPositions.forEach((pb) => {
        // Top half (red)
        ctx.fillStyle = "#E85050";
        fillRect(ctx, pb.x, pb.y, 10, 5);
        // Bottom half (white)
        ctx.fillStyle = "#F8F8F8";
        fillRect(ctx, pb.x, pb.y + 5, 10, 5);
        // Line
        ctx.fillStyle = "#282828";
        fillRect(ctx, pb.x, pb.y + 4, 10, 2);
        // Button
        ctx.fillStyle = "#F8F8F8";
        fillRect(ctx, pb.x + 4, pb.y + 3, 3, 3);
      });

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  // Pokeball battle transition: circle wipe close → pokeball → circle wipe open
  const triggerTransition = (targetScreen) => {
    setTransitionPhase("closing"); // clip-path animates from 150% → 0% over 300ms
    setTimeout(() => {
      setTransitionPhase("pokeball"); // fully closed; change screen now
      setScreen(targetScreen);
      setTimeout(() => {
        setTransitionPhase("opening"); // clip-path animates from 0% → 150% over 300ms
        setTimeout(() => {
          setTransitionPhase("idle");
        }, 300);
      }, 300);
    }, 300);
  };

  const handleMakeRoom = () => {
    const code = generateCode();
    setRoomCode(code);
    triggerTransition("makeRoom");
  };

  const handleJoinRoom = () => {
    triggerTransition("joinRoom");
  };

  const handleEnterWaitingRoomAsHost = () => {
    socket.emit("create_room", { username });

    const fallback = setTimeout(() => {
      setUser({ username });
      setRoom({
        code: roomCode,
        players: [{ username, isHost: true, socketId: socket.id, ready: false }],
        mode: "casual",
        stakeAmount: 0,
      });
      setPhase("waiting");
    }, 1000);

    socket.once("room_created", (roomData) => {
      clearTimeout(fallback);
      setUser({ username });
      setRoom(roomData);
      setPhase("waiting");
    });
  };

  const handleEnterWaitingRoomAsGuest = () => {
    socket.emit("join_room", { roomCode: joinCode, username });

    const fallback = setTimeout(() => {
      setUser({ username });
      setRoom({
        code: joinCode,
        players: [{ username, isHost: false, socketId: socket.id, ready: false }],
        mode: "casual",
        stakeAmount: 0,
      });
      setPhase("waiting");
    }, 1000);

    socket.once("room_joined", (roomData) => {
      clearTimeout(fallback);
      setUser({ username });
      setRoom(roomData);
      setPhase("waiting");
    });
  };


  // Shared pixel button style
  const PixelButton = ({ children, onClick, color, hoverColor, glowColor, id, big, style: extraStyle }) => {
    const isHovered = hoveredBtn === id;
    const pulseScale = 1 + Math.sin(Date.now() * 0.004) * 0.03;

    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHoveredBtn(id)}
        onMouseLeave={() => setHoveredBtn(null)}
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: big ? 16 : 12,
          padding: big ? "18px 40px" : "12px 28px",
          backgroundColor: isHovered ? hoverColor : color,
          color: "#FFF",
          border: "none",
          cursor: "pointer",
          imageRendering: "pixelated",
          boxShadow: isHovered
            ? `0 0 20px ${glowColor}, 0 6px 0 ${darken(color)}, inset 0 -3px 0 rgba(0,0,0,0.2)`
            : `0 0 8px ${glowColor}44, 0 4px 0 ${darken(color)}, inset 0 -3px 0 rgba(0,0,0,0.2)`,
          transform: `scale(${isHovered ? 1.08 : pulseScale}) translateY(${isHovered ? -2 : 0}px)`,
          transition: "all 0.15s ease",
          letterSpacing: 1,
          textShadow: `0 2px 4px rgba(0,0,0,0.5)`,
          borderRadius: 4,
          position: "relative",
          ...extraStyle,
        }}
      >
        {children}
      </button>
    );
  };

  function darken(hex) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((num >> 16) & 255) - 40);
    const g = Math.max(0, ((num >> 8) & 255) - 40);
    const b = Math.max(0, (num & 255) - 40);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#0A0A2E",
      }}
    >
      {/* Google Font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
        rel="stylesheet"
      />

      {/* Background canvas */}
      <canvas
        ref={canvasRef}
        width={1100}
        height={650}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
        }}
      />

      {/* Pokeball transition — dark backdrop */}
      {transitionPhase === "pokeball" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            backgroundColor: "#0A0A2E",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Pokeball transition — pokeball icon */}
      {transitionPhase === "pokeball" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ width: 80, height: 80, position: "relative" }}>
            {/* Top red half */}
            <div
              style={{
                width: 80,
                height: 40,
                backgroundColor: "#E85050",
                borderRadius: "40px 40px 0 0",
              }}
            />
            {/* Black center band */}
            <div
              style={{
                width: 80,
                height: 6,
                backgroundColor: "#282828",
                position: "relative",
              }}
            >
              {/* Center button */}
              <div
                style={{
                  position: "absolute",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: "#F8F8F8",
                  border: "4px solid #282828",
                  top: -8,
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              />
            </div>
            {/* Bottom white half */}
            <div
              style={{
                width: 80,
                height: 40,
                backgroundColor: "#F8F8F8",
                borderRadius: "0 0 40px 40px",
              }}
            />
          </div>
        </div>
      )}

      {/* UI Layer — clip-path drives the circle wipe animation */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          clipPath:
            transitionPhase === "closing" || transitionPhase === "pokeball"
              ? "circle(0% at 50% 50%)"
              : "circle(150% at 50% 50%)",
          transition:
            transitionPhase === "closing" || transitionPhase === "opening"
              ? "clip-path 300ms linear"
              : "none",
        }}
      >
        {screen === "landing" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
              animation: "fadeInUp 0.6s ease-out",
            }}
          >
            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <h1
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 42,
                  color: "#F8D030",
                  textShadow:
                    "0 0 30px rgba(248,208,48,0.5), 0 4px 0 #B8860B, 0 6px 0 #8B6914, 3px 3px 0 #0A0A2E, -3px -3px 0 #0A0A2E",
                  margin: 0,
                  letterSpacing: 3,
                  lineHeight: 1.3,
                }}
              >
                BUDDY
              </h1>
              <h2
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 24,
                  color: "#E85050",
                  textShadow:
                    "0 0 20px rgba(232,80,80,0.4), 0 3px 0 #B83030",
                  margin: "4px 0 0 0",
                  letterSpacing: 6,
                }}
              >
                LOCK IN
              </h2>
              <p
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 8,
                  color: "#8888BB",
                  marginTop: 12,
                  letterSpacing: 1,
                }}
              >
                IF YOU LOSE FOCUS, YOUR PET FALLS ASLEEP
              </p>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 28, marginTop: 12 }}>
              <PixelButton
                id="make"
                onClick={handleMakeRoom}
                color="#E85050"
                hoverColor="#FF6060"
                glowColor="#E85050"
                big
              >
                MAKE ROOM
              </PixelButton>
              <PixelButton
                id="join"
                onClick={handleJoinRoom}
                color="#58A8E8"
                hoverColor="#68B8F8"
                glowColor="#58A8E8"
                big
              >
                JOIN ROOM
              </PixelButton>
            </div>

            {/* Version tag */}
            <p
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 6,
                color: "#444466",
                marginTop: 20,
              }}
            >
              v0.1.0 — HACKATHON BUILD
            </p>
          </div>
        )}

        {screen === "makeRoom" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              animation: "fadeInUp 0.4s ease-out",
              backgroundColor: "rgba(10,10,46,0.85)",
              padding: "20px 32px",
              borderRadius: 12,
              border: "2px solid rgba(248,208,48,0.2)",
              boxShadow: "0 0 40px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              maxWidth: 500,
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <h2
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 16,
                color: "#F8D030",
                margin: 0,
                textShadow: "0 0 15px rgba(248,208,48,0.3)",
              }}
            >
              YOUR ROOM
            </h2>

            {/* Room Code Display */}
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                padding: "16px 32px",
                borderRadius: 8,
                border: "2px dashed rgba(248,208,48,0.4)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <p
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 32,
                  color: "#F8D030",
                  margin: 0,
                  letterSpacing: 8,
                  textShadow: "0 0 20px rgba(248,208,48,0.5)",
                }}
              >
                {roomCode}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 12,
                  padding: "6px 16px",
                  background: copied ? "#F8D030" : "#222",
                  color: copied ? "#222" : "#F8D030",
                  border: "2px solid #F8D030",
                  borderRadius: 6,
                  cursor: "pointer",
                  outline: "none",
                  boxShadow: "0 0 6px #F8D030",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 7,
                color: "#8888BB",
              }}
            >
              SHARE THIS CODE WITH YOUR BUDDIES
            </p>

            {/* Username */}
            <input
              type="text"
              placeholder="YOUR NAME"
              value={username}
              onChange={(e) => setUsername(e.target.value.toUpperCase())}
              maxLength={12}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 11,
                padding: "10px 16px",
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "2px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                color: "#FFF",
                textAlign: "center",
                outline: "none",
                width: 220,
                letterSpacing: 2,
              }}
            />

            {/* Players in room */}
            <div style={{ marginTop: 4, width: "100%" }}>
              <p
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 7,
                  color: "#68B868",
                  marginBottom: 8,
                }}
              >
                PLAYERS (1/4)
              </p>
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderRadius: 6,
                  padding: "8px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "#68B868",
                      boxShadow: "0 0 6px #68B868",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 8,
                      color: "#CCC",
                    }}
                  >
                    {username || "YOU"}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 6,
                      color: "#F8D030",
                      marginLeft: "auto",
                    }}
                  >
                    HOST
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <PixelButton
                id="back1"
                onClick={() => triggerTransition("landing")}
                color="#444466"
                hoverColor="#555577"
                glowColor="#444466"
              >
                BACK
              </PixelButton>
              <PixelButton
                id="start"
                onClick={handleEnterWaitingRoomAsHost}
                color="#68B868"
                hoverColor="#78C878"
                glowColor="#68B868"
              >
                ENTER WAITING ROOM
              </PixelButton>
            </div>
          </div>
        )}

        {screen === "joinRoom" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              animation: "fadeInUp 0.4s ease-out",
              backgroundColor: "rgba(10,10,46,0.85)",
              padding: "20px 32px",
              borderRadius: 12,
              border: "2px solid rgba(88,168,232,0.2)",
              boxShadow: "0 0 40px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              maxWidth: 500,
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <h2
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 16,
                color: "#58A8E8",
                margin: 0,
                textShadow: "0 0 15px rgba(88,168,232,0.3)",
              }}
            >
              JOIN ROOM
            </h2>

            {/* Room Code Input */}
            <input
              type="text"
              placeholder="ROOM CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 24,
                padding: "14px 24px",
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "2px solid rgba(88,168,232,0.4)",
                borderRadius: 8,
                color: "#58A8E8",
                textAlign: "center",
                outline: "none",
                width: 240,
                letterSpacing: 8,
              }}
            />

            {/* Username */}
            <input
              type="text"
              placeholder="YOUR NAME"
              value={username}
              onChange={(e) => setUsername(e.target.value.toUpperCase())}
              maxLength={12}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 11,
                padding: "10px 16px",
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "2px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                color: "#FFF",
                textAlign: "center",
                outline: "none",
                width: 220,
                letterSpacing: 2,
              }}
            />

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <PixelButton
                id="back2"
                onClick={() => triggerTransition("landing")}
                color="#444466"
                hoverColor="#555577"
                glowColor="#444466"
              >
                BACK
              </PixelButton>
              <PixelButton
                id="joinGo"
                onClick={() => {
                  if (joinCode.length === 6) handleEnterWaitingRoomAsGuest();
                }}
                color="#58A8E8"
                hoverColor="#68B8F8"
                glowColor="#58A8E8"
                style={{ opacity: joinCode.length === 6 ? 1 : 0.4 }}
              >
                ENTER WAITING ROOM
              </PixelButton>
            </div>
          </div>
        )}


      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        input::placeholder {
          color: #555577;
        }
        input:focus {
          border-color: rgba(248,208,48,0.5) !important;
          box-shadow: 0 0 10px rgba(248,208,48,0.2);
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}