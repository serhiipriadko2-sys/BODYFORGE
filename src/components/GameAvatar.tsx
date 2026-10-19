import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { BodyBuild, Muscle, Outfit } from '../lib/game';
import Avatar from './Avatar';

const Avatar3D = lazy(() => import('./Avatar3D'));

interface GameAvatarProps {
  workouts: number;
  build: BodyBuild;
  muscles: Partial<Record<Muscle, number>>;
  outfit: Outfit;
  paused?: boolean;
  className?: string;
}

/**
 * Mount WebGL only while visible and never while pose estimation is active.
 * The old lightweight SVG remains the fallback on unsupported devices.
 */
export default function GameAvatar({ workouts, build, muscles, outfit, paused = false, className }: GameAvatarProps) {
  const container = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const watcher = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), {
      rootMargin: '80px 0px', threshold: .015,
    });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);
  const show3D = inView && !paused;
  return (
    <div className={`avatar-3d-slot ${className ?? ''}`} ref={container}>
      {show3D ? (
        <Suspense fallback={<div className="avatar-3d-wait"><div className="avatar-3d-loading-orb"/><span>КУЗНЕЦ ГОТОВИТ БОЙЦА...</span></div>}>
          <Avatar3D build={build} muscles={muscles} outfit={outfit} />
        </Suspense>
      ) : (
        <div className="avatar-3d-idle">
          <Avatar workouts={workouts} build={build} muscles={muscles} outfit={outfit} />
        </div>
      )}
    </div>
  );
}
