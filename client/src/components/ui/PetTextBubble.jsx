import { useState, useEffect } from 'react';

/**
 * Pixel-art styled text bubble that appears over a pet.
 * Auto-dismisses after `duration` ms.
 */
export function PetTextBubble({ text, duration = 3000 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [text, duration]);

  if (!visible || !text) return null;

  return (
    <div style={styles.container}>
      <div style={styles.bubble}>{text}</div>
      <div style={styles.tail} />
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pointerEvents: 'none',
    zIndex: 10,
    animation: 'fadeInUp 0.25s ease-out',
  },
  bubble: {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 8,
    color: '#FFF',
    background: 'rgba(10,10,46,0.92)',
    border: '2px solid rgba(248,208,48,0.6)',
    borderRadius: 8,
    padding: '8px 12px',
    maxWidth: 180,
    textAlign: 'center',
    lineHeight: 1.4,
    boxShadow: '0 0 12px rgba(0,0,0,0.5)',
    whiteSpace: 'pre-wrap',
  },
  tail: {
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: '6px solid rgba(248,208,48,0.6)',
  },
};
