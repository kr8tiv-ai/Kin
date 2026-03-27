/**
 * useScrollAnimations - GSAP ScrollTrigger + Lenis smooth scroll
 *
 * Matches the meetyourkin.com animation patterns:
 * - Lenis smooth scroll (duration 1.5)
 * - GSAP scroll reveal (y:25, duration:0.7, ease:power2.out)
 * - Card stagger reveal (y:30, duration:0.5, stagger:0.1)
 */

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initialize Lenis smooth scrolling on a container.
 * Returns a cleanup function.
 */
export function useLenisScroll(containerRef?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.5,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      ...(containerRef?.current ? { wrapper: containerRef.current } : {}),
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    const frameId = requestAnimationFrame(raf);

    // Sync Lenis scroll position with ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, [containerRef]);
}

/**
 * Apply scroll-reveal animation to elements with a given selector
 * inside a container ref. Matches meetyourkin.com pattern:
 * y:25 → 0, duration:0.7, ease:power2.out
 */
export function useScrollReveal(
  containerRef: React.RefObject<HTMLElement | null>,
  selector = '.gs-reveal',
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const elements = container.querySelectorAll(selector);
    if (elements.length === 0) return;

    const animations = Array.from(elements).map((elem) =>
      gsap.from(elem, {
        scrollTrigger: {
          trigger: elem,
          start: 'top 92%',
          toggleActions: 'play none none none',
        },
        y: 25,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
      }),
    );

    return () => {
      animations.forEach((anim) => anim.kill());
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, [containerRef, selector]);
}

/**
 * Apply stagger animation to card grids.
 * Matches meetyourkin.com card stagger: y:30, duration:0.5, stagger:0.1
 */
export function useCardStagger(
  containerRef: React.RefObject<HTMLElement | null>,
  gridSelector = '.gs-card-grid',
  cardSelector = '.gs-card',
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const grids = container.querySelectorAll(gridSelector);
    if (grids.length === 0) return;

    const animations: gsap.core.Tween[] = [];

    grids.forEach((grid) => {
      const cards = grid.querySelectorAll(cardSelector);
      if (cards.length === 0) return;

      const anim = gsap.from(cards, {
        scrollTrigger: {
          trigger: grid,
          start: 'top 88%',
          toggleActions: 'play none none none',
        },
        y: 30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
      });

      animations.push(anim);
    });

    return () => {
      animations.forEach((anim) => anim.kill());
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, [containerRef, gridSelector, cardSelector]);
}

/**
 * Combined hook: Lenis + scroll reveal + card stagger.
 * Drop-in for Dashboard or any scrollable page.
 */
export function useKinAnimations() {
  const containerRef = useRef<HTMLDivElement>(null);

  useLenisScroll(containerRef);
  useScrollReveal(containerRef);
  useCardStagger(containerRef);

  return containerRef;
}
