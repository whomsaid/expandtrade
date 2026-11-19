import { createElement, useEffect, useRef, useState } from 'react';

export function useRevealOnScroll({ threshold = 0.01, rootMargin = '0px 0px 80px 0px' } = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || isVisible) return undefined;

    if (
      typeof window === 'undefined' ||
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setIsVisible(true);
      return undefined;
    }

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
    if (rect.top < viewportHeight * 1.05) {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    const safetyTimer = setTimeout(() => {
      setIsVisible(true);
      observer.disconnect();
    }, 650);

    return () => {
      clearTimeout(safetyTimer);
      observer.disconnect();
    };
  }, [isVisible, threshold, rootMargin]);

  return [ref, isVisible];
}

export function RevealBlock({ as: Tag = 'div', className = '', delayMs = 0, children, ...rest }) {
  const [ref, isVisible] = useRevealOnScroll();

  return createElement(
    Tag,
    {
      ref,
      style: delayMs ? { transitionDelay: `${delayMs}ms` } : undefined,
      className: `reveal-section ${isVisible ? 'is-visible' : ''} ${className}`.trim(),
      ...rest,
    },
    children
  );
}
