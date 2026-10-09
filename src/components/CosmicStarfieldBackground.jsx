'use client';

import React, { useEffect, useRef, memo } from 'react';

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
 * High-Performance 60FPS Canvas Starfield with Subtle Motion Trails & Meteors
 * 
 * @param {Object} props
 * @param {number} [props.starCount=240] - Total star particle density
 * @param {boolean} [props.enableMeteors=true] - Enable occasional shooting stars
 * @param {number} [props.speed=0.35] - Drift speed factor
 * @param {number} [props.trailFactor=1.2] - Trail length and warp streak multiplier
 * @param {string} [props.className='']
 */
function CosmicStarfieldBackground({
  starCount = 240,
  enableMeteors = true,
  speed = 0.35,
  trailFactor = 1.2,
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
      // Cap DPR to 1 to eliminate multi-megapixel canvas fill-rate lag on high-DPI/Retina screens
      dpr = 1;

      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      initStars();
    };

    const initStars = () => {
      stars.length = 0;
      // High-performance star density (capped at 95 on desktop, 45 on mobile)
      const count = Math.min(Math.floor((width * height) / 16000) || 60, width < 768 ? 45 : 95);

      for (let i = 0; i < count; i++) {
        const depth = Math.random(); // 0 (far) to 1 (near)
        const sizeRand = Math.random();
        
        let radius;
        if (sizeRand > 0.94) {
          radius = Math.random() * 1.2 + 1.3; // Large bright anchor stars
        } else if (sizeRand > 0.70) {
          radius = Math.random() * 0.6 + 0.75; // Medium stars
        } else {
          radius = Math.random() * 0.4 + 0.35; // Distant background pinpricks
        }

        // Slight downward-diagonal forward drift direction simulating high-speed cosmic flight
        const vx = (Math.random() - 0.5) * 0.1 * speed * (depth + 0.3);
        const vy = (Math.random() * 0.3 + 0.2) * speed * (depth + 0.4);

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius,
          baseAlpha: Math.random() * 0.45 + 0.35,
          twinkleSpeed: Math.random() * 0.025 + 0.01,
          twinklePhase: Math.random() * Math.PI * 2,
          colorPrefix: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
          vx,
          vy,
          depth: depth + 0.25,
          hasGlow: sizeRand > 0.92,
          trailWeight: Math.random() * 0.4 + 0.6
        });
      }
    };

    const spawnMeteor = () => {
      if (!enableMeteors) return;
      const startX = Math.random() * (width * 0.8);
      const startY = Math.random() * (height * 0.4);
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2; // ~45 degree diagonal trajectory
      const velocity = Math.random() * 9 + 11;
      const length = Math.random() * 130 + 90;

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
      targetMouseX = (e.clientX / width - 0.5) * 28;
      targetMouseY = (e.clientY / height - 0.5) * 28;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    handleResize();

    let lastTime = performance.now();
    let isRunning = true;

    // 60FPS High-Speed Render Loop with Particle Trails
    const render = (currentTime) => {
      if (!isRunning || document.hidden) {
        return;
      }

      const dt = Math.min((currentTime - lastTime) / 16.666, 2.5);
      lastTime = currentTime;

      // Soft inertia parallax with mouse
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      ctx.clearRect(0, 0, width, height);

      // Check for meteor spawn
      if (enableMeteors && Date.now() > nextMeteorTime) {
        spawnMeteor();
      }

      // Render & update stars with high-speed subtle trailing effect
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Cosmic forward drift
        star.x += star.vx * dt;
        star.y += star.vy * dt;

        // Wrap around viewport edges seamlessly
        if (star.x < -20) star.x = width + 20;
        if (star.x > width + 20) star.x = -20;
        if (star.y < -20) star.y = height + 20;
        if (star.y > height + 20) star.y = -20;

        // Parallax offset based on star depth
        const drawX = star.x + mouseX * star.depth;
        const drawY = star.y + mouseY * star.depth;

        // Twinkle luminosity cycle
        star.twinklePhase += star.twinkleSpeed * dt;
        const alpha = Math.max(0.18, Math.min(1, star.baseAlpha + Math.sin(star.twinklePhase) * 0.35));

        // Effective velocity vector including parallax inertia
        const effectiveVx = star.vx + (targetMouseX - mouseX) * 0.015 * star.depth;
        const effectiveVy = star.vy + (targetMouseY - mouseY) * 0.015 * star.depth;
        const speedMag = Math.hypot(effectiveVx, effectiveVy) || 0.01;

        // Calculate subtle trailing streak length proportional to speed & depth
        const trailLength = Math.max(
          4,
          (speedMag * 55 + star.radius * 2.8) * star.depth * star.trailWeight * trailFactor
        );

        const tailX = drawX - (effectiveVx / speedMag) * trailLength;
        const tailY = drawY - (effectiveVy / speedMag) * trailLength;

        // Draw star motion trail streak (high-speed batched stroke without gradient object allocation)
        ctx.strokeStyle = `${star.colorPrefix}${alpha * 0.45})`;
        ctx.lineWidth = Math.max(0.5, star.radius * 0.85);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(drawX, drawY);
        ctx.stroke();

        // Draw soft ambient glow for bright foreground stars (fast dual-arc pass, zero GC gradient churn)
        if (star.hasGlow) {
          ctx.fillStyle = `${star.colorPrefix}${alpha * 0.18})`;
          ctx.beginPath();
          ctx.arc(drawX, drawY, star.radius * 2.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw star core head
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

      if (isRunning) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      } else {
        lastTime = performance.now();
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(render);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animationFrameId = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [starCount, enableMeteors, speed, trailFactor]);

  return (
    <div className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${className}`}>
      {/* High-performance canvas particle layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full"
      />

      {/* Deep Space Cosmic Nebula & Planetary Atmospheric Horizon Lighting - 100% GPU shader-accelerated without compositor filter blur */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-[#010409] via-cyan-950/10 to-transparent pointer-events-none" />
      <div className="hidden md:block absolute -top-32 left-1/2 -translate-x-1/2 w-[1200px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.08),transparent_70%)] pointer-events-none" />
      <div className="hidden md:block absolute top-[25%] left-[-5%] w-[650px] h-[650px] bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.07),transparent_70%)] pointer-events-none" />
      <div className="hidden md:block absolute top-[55%] right-[-5%] w-[700px] h-[700px] bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.07),transparent_70%)] pointer-events-none" />
      <div className="hidden md:block absolute bottom-[-10%] left-[20%] w-[750px] h-[450px] bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.06),transparent_70%)] pointer-events-none" />
    </div>
  );
}

export default memo(CosmicStarfieldBackground);
