import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BodyBuild, Muscle, Outfit } from '../lib/game';
import Avatar from './Avatar';
import { DEFAULT_AVATAR_LOOK, type AvatarLook } from '../lib/avatarLook';

export type AvatarFocus = 'full' | 'portrait';

const Avatar3D = lazy(() => import('./Avatar3D'));

// A failed lazy chunk (offline/stale deployment) must not erase the entire game.
class AvatarBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface GameAvatarProps {
  workouts: number;
  build: BodyBuild;
  muscles: Partial<Record<Muscle, number>>;
  outfit: Outfit;
  paused?: boolean;
  className?: string;
  look?: AvatarLook;
  focus?: AvatarFocus;
  yaw?: number;
  onYawChange?: (angle: number) => void;
}

/**
 * Mount WebGL only while visible and never while pose estimation is active.
 * The old lightweight SVG remains the fallback on unsupported devices.
 */
export default function GameAvatar({ workouts, build, muscles, outfit, paused = false, className,
  look = DEFAULT_AVATAR_LOOK, focus = 'full', yaw = -.21, onYawChange }: GameAvatarProps) {
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
    <div className={`avatar-3d-slot ${className ?? ''}`} ref={container} data-avatar-focus={focus}>
      {show3D ? (
        <AvatarBoundary fallback={<div className="avatar-3d-fallback" data-3d-status="fallback">
          <Avatar workouts={workouts} build={build} muscles={muscles} outfit={outfit} look={look}/>
          <span>3D не загрузилось. Игра доступна с облегчённым персонажем; повторная загрузка — после обновления страницы.</span>
        </div>}>
        <Suspense fallback={<div className="avatar-3d-wait"><div className="avatar-3d-loading-orb"/><span>КУЗНЕЦ ГОТОВИТ БОЙЦА...</span></div>}>
          <Avatar3D build={build} muscles={muscles} outfit={outfit} look={look}
            focus={focus} yaw={yaw} onYawChange={onYawChange} />
        </Suspense>
        </AvatarBoundary>
      ) : (
        <div className="avatar-3d-idle">
          <Avatar workouts={workouts} build={build} muscles={muscles} outfit={outfit} look={look} />
        </div>
      )}
    </div>
  );
}
