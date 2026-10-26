import type { SVGProps } from 'react';

export type ForgeGlyphName = 'home' | 'scan' | 'body' | 'tower' | 'orbit' | 'forge';

type ForgeGlyphProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: ForgeGlyphName;
  size?: number;
};

/** The app's small geometric symbols share an open frame and a solid core. */
export default function ForgeGlyph({ name, size = 24, ...props }: ForgeGlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {name === 'home' && <>
        <path d="m4 9 8-5 8 5v10l-8 3-8-3V9Z" />
        <path d="m8 12 4-2 4 2v5l-4 1.5L8 17v-5Z" />
        <path d="M12 4v3M4 9l3 1.5M20 9l-3 1.5" />
        <path d="m12 12 2 1.25v2.5L12 17l-2-1.25v-2.5L12 12Z" fill="currentColor" stroke="none" />
      </>}
      {name === 'scan' && <>
        <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M3 12h4M17 12h4" />
        <path d="m12 8 4 4-4 4-4-4 4-4Z" />
        <path d="m12 10.5 1.5 1.5-1.5 1.5-1.5-1.5 1.5-1.5Z" fill="currentColor" stroke="none" />
      </>}
      {name === 'body' && <>
        <circle cx="12" cy="5" r="2.5" />
        <path d="m7 10 5 2 5-2M7 10l-3 4M17 10l3 4M8 11l1 6-2 5M16 11l-1 6 2 5M9 17h6" />
        <path d="m12 12 2 2-2 2-2-2 2-2Z" fill="currentColor" stroke="none" />
      </>}
      {name === 'tower' && <>
        <path d="M4 21h16M7 21V8l5-5 5 5v13M7 10h10M7 15h10M10 21v-3h4v3" />
        <path d="m12 6 1.5 1.5L12 9l-1.5-1.5L12 6Z" fill="currentColor" stroke="none" />
      </>}
      {name === 'orbit' && <>
        <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-35 12 12)" />
        <path d="M10 3.4a8.8 8.8 0 0 1 10.6 10.7M14 20.6A8.8 8.8 0 0 1 3.4 10" />
        <path d="m12 8.5 3.5 3.5-3.5 3.5L8.5 12 12 8.5Z" fill="currentColor" stroke="none" />
      </>}
      {name === 'forge' && <>
        <path d="M3 9h18l-4 5H9l-2 4H4l2-5-3-4ZM7 21h12M10 18h6l2 3H8l2-3ZM12 2v3M17 3l-2 3" />
        <path d="m11 9 2 2-2 2-2-2 2-2Z" fill="currentColor" stroke="none" />
      </>}
    </svg>
  );
}
