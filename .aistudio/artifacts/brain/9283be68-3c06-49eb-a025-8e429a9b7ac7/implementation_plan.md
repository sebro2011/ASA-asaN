# iOS-Style Floating Bottom Navigation Bar Implementation Plan

Implement a sleek, glassmorphic floating bottom navigation pill for mobile and tablet devices with fluid animated tab transitions, trilingual labels, and responsive horizontal touch-swipe gestures.

---

## 1. User Specifications & Confirmed Preferences

- **Container Styling**: Centered floating pill with `fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#010409]/85 backdrop-blur-2xl border border-white/10 rounded-full px-3 py-2 shadow-2xl`.
- **Target Viewports**: Mobile and tablet viewports only (`lg:hidden`).
- **Tab Presentation**: Stacked icons with compact trilingual labels (`si`, `ta`, `en`) and spring bounce scaling.
- **Swipe Interaction**:
  - Horizontal touch-swiping across the floating bar itself.
  - Horizontal touch-swiping across the main content area with gesture threshold/velocity detection, excluding interactive 3D canvases, modal dialogs, and text inputs to prevent event contention.
- **Active Tab Pill**: Framer Motion `layoutId` pill indicator with elastic spring physics, soft cyan/indigo glow, and active icon elevation.

---

## 2. Architecture & Component Updates

### A. Component Refactor: `NASABottomBar.jsx`
- Transform the existing edge-to-edge docked bar into an iOS floating pill structure.
- Add touch drag/swipe listener (`onTouchStart`, `onTouchMove`, `onTouchEnd`) on the bar container to detect left/right swipes between tabs.
- Ensure the floating pill is horizontally scrollable or dynamically fitted with flex-nowrap and comfortable tap targets (`min-h-[44px]`).
- Render fluid `motion.div` active indicator with glass gradient and subtle glow.
- Provide subtle haptic feedback on touch devices when changing tabs via `navigator.vibrate(10)`.

### B. Global/Content Swipe Detection in `App.tsx`
- Implement custom horizontal swipe handling on the main content container:
  - Ordered tab sequence: `['apod', 'launch', '3d', 'missions', 'news', 'quiz', 'iss', 'assistant']`.
  - Track horizontal touch delta (`deltaX`) and velocity.
  - Apply ignore rules when touches originate within 3D canvas elements (`canvas`, `[data-no-swipe]`), range inputs, or open modals.
  - Smoothly switch to the preceding or succeeding tab when swipe delta exceeds the threshold (e.g., 50px).

### C. Floating Voice & Bottom Spacing Clearance
- Adjust bottom margin and padding on page content (`pb-24`) so no content or footer elements are obscured by the floating pill.
- Position the floating voice control button comfortably above the bottom floating pill on mobile/tablet screens.

---

## 3. Verification Plan

- Run `compile_applet` and `lint_applet` to verify clean build without syntax or TypeScript errors.
- Verify active indicator pill animation during tab transitions.
- Verify horizontal swipe gestures switch tabs in sequence without conflicting with 3D canvas interactions.
- Confirm trilingual label rendering and dark cosmic aesthetic alignment.
