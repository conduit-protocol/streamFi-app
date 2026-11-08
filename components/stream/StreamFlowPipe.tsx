'use client';

import { useEffect, useRef } from 'react';

interface StreamFlowPipeProps {
  /** Whether the stream is actively transferring (controls animation speed). */
  active: boolean;
  /** Stream progress 0–1 (drives particle density). */
  progress: number;
  /** Label shown at the sender end. */
  senderLabel?: string;
  /** Label shown at the recipient end. */
  recipientLabel?: string;
}

/**
 * StreamFlowPipe — a live animated visual showing value flowing from
 * sender to recipient as particles travelling through a pipe (#778).
 *
 * Uses a <canvas> particle animation. Particles move left → right at a
 * speed proportional to `active`/`progress`, providing intuitive real-time
 * feedback that value is continuously transferring.
 */
export function StreamFlowPipe({
  active,
  progress,
  senderLabel = 'Sender',
  recipientLabel = 'Recipient',
}: StreamFlowPipeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Array<{ x: number; y: number; speed: number; size: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Seed particles
    const count = active ? 28 : 10;
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: height / 2 + (Math.random() - 0.5) * (height * 0.4),
      speed: 0.6 + Math.random() * 1.4,
      size: 2 + Math.random() * 3,
    }));

    let running = true;

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      // Pipe background
      const pipeTop = height / 2 - 8;
      const pipeBottom = height / 2 + 8;
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.08)');
      gradient.addColorStop(1, 'rgba(236, 72, 153, 0.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, pipeTop, width, pipeBottom - pipeTop);

      // Pipe border
      ctx.strokeStyle = active
        ? 'rgba(99, 102, 241, 0.35)'
        : 'rgba(156, 163, 175, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, pipeTop, width, pipeBottom - pipeTop);

      // Particles
      const speedMul = active ? 1.0 + progress * 0.8 : 0.15;
      for (const p of particlesRef.current) {
        p.x += p.speed * speedMul;
        if (p.x > width + 10) {
          p.x = -10;
          p.y = height / 2 + (Math.random() - 0.5) * (height * 0.4);
        }

        const alpha = active ? 0.7 : 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, progress]);

  return (
    <div
      className="relative w-full"
      role="img"
      aria-label={
        active
          ? `Animated flow visualisation — tokens streaming from ${senderLabel} to ${recipientLabel}`
          : `Flow visualisation — stream ${active ? 'active' : 'not currently transferring'}`
      }
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-gray-400 dark:text-gray-500">{senderLabel}</span>
        <span className={`text-xs font-semibold ${active ? 'text-indigo-500' : 'text-gray-400'}`}>
          {active ? '● Live' : '○ Idle'}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{recipientLabel}</span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-16 rounded-lg border border-gray-100 dark:border-gray-800"
        style={{ display: 'block' }}
      />
    </div>
  );
}
