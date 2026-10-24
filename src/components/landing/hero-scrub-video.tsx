"use client";

import { useEffect, useRef } from "react";

const HERO_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260601_110537_3a579fa0-7bbc-4d94-9d25-0e816c7840f5.mp4";

export function HeroScrubVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previousXRef = useRef<number | null>(null);
  const targetTimeRef = useRef(0);
  const isSeekingRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isMobile = () => window.innerWidth < 1024;

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const applyTargetTime = () => {
      if (!video.duration || Number.isNaN(video.duration) || isSeekingRef.current) return;
      isSeekingRef.current = true;
      video.currentTime = clamp(targetTimeRef.current, 0, video.duration);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (isMobile() || !video.duration || Number.isNaN(video.duration)) return;

      const previousX = previousXRef.current ?? event.clientX;
      const delta = event.clientX - previousX;
      previousXRef.current = event.clientX;

      targetTimeRef.current = clamp(
        targetTimeRef.current + (delta / window.innerWidth) * 0.8 * video.duration,
        0,
        video.duration,
      );

      applyTargetTime();
    };

    const handleSeeked = () => {
      isSeekingRef.current = false;
      if (!isMobile() && Math.abs(video.currentTime - targetTimeRef.current) > 0.04) {
        applyTargetTime();
      }
    };

    const handleLoadedMetadata = () => {
      targetTimeRef.current = Math.min(video.duration * 0.28, video.duration || 0);

      if (isMobile()) {
        video.autoplay = true;
        void video.play().catch(() => undefined);
      } else {
        video.pause();
        applyTargetTime();
      }
    };

    const handleResize = () => {
      previousXRef.current = null;
      if (isMobile()) {
        video.autoplay = true;
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("seeked", handleSeeked);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("resize", handleResize);

    handleResize();

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("seeked", handleSeeked);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="closr-hero-video-wrap pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        className="h-full w-full object-cover object-right-bottom"
      >
        <source src={HERO_VIDEO_URL} type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,9,0.96)_0%,rgba(5,7,9,0.82)_36%,rgba(5,7,9,0.44)_64%,rgba(5,7,9,0.1)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,9,0.72)_0%,rgba(5,7,9,0.08)_42%,rgba(5,7,9,0.9)_100%)]" />
    </div>
  );
}
