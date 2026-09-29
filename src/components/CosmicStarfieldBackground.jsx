'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Realistic stellar spectral colors (O, B, A, F, G, K, M classification)
 */
const STAR_COLORS = [
  'rgba(255, 255, 255, ',    // Pure White (A-type)
  'rgba(165, 243, 252, ',    // Cyan / Blue-White (B-type)
  'rgba(191, 219, 254, ',    // Deep Sky Blue (O-type)
  'rgba(254, 240, 138, ',    // Yellow-White (F/G-type)
  'rgba(254, 215, 170, ',    // Warm Amber (K-type)
  'rgba(253, 164, 175, '     // Soft Red/Pink (M-type)
];

/**
 * High-Performance 60FPS Canvas Starfield & Meteor Particle Background
 * 
 * @param {Object} props
 * @param {number} [props.starCount=220] - Total star particle density
 * @param {boolean} [props.enableMeteors=true] - Enable occasional shooting stars
 * @param {number} [props.speed=0.25] - Drift speed factor
 * @param {string} [props.className='']
 */
export default function CosmicStarfieldBackground({
  starCount = 220,
  enableMeteors = true,
  speed = 0.25,
  className = ''
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Mouse parallax inertia targets
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;

    // Stars particle pool
    const stars = [];

    // Meteors / Shooting stars pool
    const meteors = [];
    let nextMeteorTime = Date.now() + Math.random() * 4000 + 2000;

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      initStars();
    };

    const initStars = () => {
      stars.length = 0;
      const count = Math.floor((width * height) / 8000) || starCount;

      for (let i = 0; i < count; i++) {
        const depth = Math.random(); // 0 (far) to 1 (near)
        const sizeRand = Math.random();
        
        let radius;
        if (sizeRand > 0.96) {
          radius = Math.random() * 1.5 + 1.6; // Large bright anchor stars
        } else if (sizeRand > 0.75) {
          radius = Math.random() * 0.8 + 0.9;  // Medium stars
        } else {
          radius = Math.random() * 0.5 + 0.4;  // Distant background pinpricks
        }

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius,
          baseAlpha: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.03 + 0.01,
          twinklePhase: Math.random() * Math.PI * 2,
          colorPrefix: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
          vx: (Math.random() - 0.5) * 0.08 * speed * (depth + 0.2),
          vy: (Math.random() * 0.15 + 0.05) * speed * (depth + 0.3),
          depth: depth + 0.2,
          hasGlow: sizeRand > 0.92
        });
      }
    };

    const spawnMeteor = () => {
      if (!enableMeteors) return;
      const startX = Math.random() * (width * 0.8);
      const startY = Math.random() * (height * 0.4);
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2; // roughly ~45 degree diagonal trajectory
      const velocity = Math.random() * 9 + 11;
      const length = Math.random() * 120 + 80;

      meteors.push({
        x: startX,
        y: startY,
        length,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        alpha: 1,
        fadeSpeed: Math.random() * 0.02 + 0.015,
        color: Math.random() > 0.5 ? '#67e8f9' : '#ffffff'
      });

      nextMeteorTime = Date.now() + Math.random() * 7000 + 4000;
    };

    const handleMouseMove = (e) => {
      targetMouseX = (e.clientX / width - 0.5) * 25;
      targetMouseY = (e.clientY / height - 0.5) * 25;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    handleResize();

    let lastTime = performance.now();

    // 60FPS Render Loop
    const render = (currentTime) => {
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((currentTime - lastTime) / 16.666, 2.5);
      lastTime = currentTime;

      // Soft inertia parallax
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      ctx.clearRect(0, 0, width, height);

      // Check for meteor spawn
      if (enableMeteors && Date.now() > nextMeteorTime) {
        spawnMeteor();
      }

      // Render & update stars
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Cosmic slow drift
        star.x += star.vx * dt;
        star.y += star.vy * dt;

        // Wrap around viewport edges
        if (star.x < 0) star.x = width;
        if (star.x > width) star.x = 0;
        if (star.y < 0) star.y = height;
        if (star.y > height) star.y = 0;

        // Parallax offset based on star depth
        const drawX = star.x + mouseX * star.depth;
        const drawY = star.y + mouseY * star.depth;

        // Twinkle luminosity cycle
        star.twinklePhase += star.twinkleSpeed * dt;
        const alpha = Math.max(0.15, Math.min(1, star.baseAlpha + Math.sin(star.twinklePhase) * 0.35));

        // Draw soft radial glow for larger stars
        if (star.hasGlow) {
          const glowGrad = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, star.radius * 3.5);
          glowGrad.addColorStop(0, `${star.colorPrefix}${alpha * 0.8})`);
          glowGrad.addColorStop(0.4, `${star.colorPrefix}${alpha * 0.2})`);
          glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(drawX, drawY, star.radius * 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw star core
        ctx.fillStyle = `${star.colorPrefix}${alpha})`;
        ctx.beginPath();
        ctx.arc(drawX, drawY, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render & update meteors (shooting stars)
      for (let j = meteors.length - 1; j >= 0; j--) {
        const m = meteors[j];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.alpha -= m.fadeSpeed * dt;

        if (m.alpha <= 0 || m.x > width + 200 || m.y > height + 200) {
          meteors.splice(j, 1);
          continue;
        }

        const tailX = m.x - (m.vx / 10) * m.length;
        const tailY = m.y - (m.vy / 10) * m.length;

        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.7, m.color === '#67e8f9' ? `rgba(103, 232, 249, ${m.alpha * 0.6})` : `rgba(255, 255, 255, ${m.alpha * 0.6})`);
        grad.addColorStop(1, `rgba(255, 255, 255, ${m.alpha})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();

        // Meteor glowing head
        ctx.fillStyle = `rgba(255, 255, 255, ${m.alpha})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [starCount, enableMeteors, speed]);

  return (
    <div className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${className}`}>
      {/* High-performance canvas particle layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full"
      />

      {/* Deep Space Cosmic Nebula Color Glows */}
      <div className="absolute top-[-10%] left-[15%] w-[650px] h-[650px] bg-cyan-600/10 rounded-full blur-[140px] animate-pulse pointer-events-none" style={{ animationDuration: '8s' }} />
      <div className="absolute top-[40%] right-[-10%] w-[700px] h-[700px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[10%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none" />
    </div>
  );
}
