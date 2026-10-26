import type { SVGProps } from 'react';

/** Original BODYFORGE monogram: cut metal, an open core, and a rising F. */
export default function BrandMark({ size = 32, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd"
        d="M8 11h18l9 9v7l-5 5 5 5v7l-9 9H8V11Zm9 9v8h7l3-3v-2l-3-3h-7Zm0 16v8h7l3-3v-2l-3-3h-7Z" />
      <path fill="currentColor" d="M41 11h17v9H49v9h8v8h-8v16h-8V11Z" />
      <path fill="currentColor" d="m35 27 5 5-5 5-5-5 5-5Z" />
    </svg>
  );
}
