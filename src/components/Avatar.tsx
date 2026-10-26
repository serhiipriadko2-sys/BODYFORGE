import { useId } from 'react';
import type { BodyBuild, Muscle, Outfit } from '../lib/game';
import { DEFAULT_AVATAR_LOOK, lookColors, type AvatarLook } from '../lib/avatarLook';

interface AvatarProps {
  workouts: number;
  build?: BodyBuild;
  muscles?: Partial<Record<Muscle, number>>;
  outfit?: Outfit;
  look?: AvatarLook;
}

/** Human character; coin-funded upgrades change muscle definition independently. */
export default function Avatar({ workouts, build = 'lean', muscles, outfit = 'base', look = DEFAULT_AVATAR_LOOK }: AvatarProps) {
  const id = useId().replace(/:/g, '');
  const fallback = Math.min(4, Math.max(0, workouts));
  const armLevel = muscles?.arms ?? fallback;
  const coreLevel = muscles?.core ?? fallback;
  const backLevel = muscles?.back ?? fallback;
  const legLevel = muscles?.legs ?? fallback;
  const power = muscles
    ? Math.min(4, Math.floor((armLevel + coreLevel + backLevel + legLevel) / 4))
    : fallback;
  const extraWaist = build === 'solid' ? 10 : 0;
  const shoulder = 66 + armLevel * 3.5 + backLevel * 2.5 + (build === 'solid' ? 7 : 0);
  const arm = 13 + armLevel * 3;
  const absOpacity = 0.11 + coreLevel * 0.16;
  const chestOpacity = 0.26 + backLevel * 0.08;
  const shortsLight = outfit === 'ember' ? '#cf5f31' : outfit === 'steel' ? '#77929b' : '#554038';
  const shortsDark = outfit === 'ember' ? '#531f16' : outfit === 'steel' ? '#23333b' : '#241915';
  const colors = lookColors(look);
  const accent = colors.trim;
  const blend = (base: string, target: number, fraction: number) => '#'+[1,3,5].map((index) => {
    const old = Number.parseInt(base.slice(index, index + 2), 16);
    return Math.round(old + (target - old) * fraction).toString(16).padStart(2, '0');
  }).join('');

  return (
    <svg className="fighter-svg" viewBox="0 0 390 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Персонаж BODYFORGE. Телосложение: ${build === 'solid' ? 'крепкое' : 'стройное'}, мышцы ${armLevel + coreLevel + legLevel + backLevel} очков, форма ${outfit}`}>
      <defs>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0%" stopColor="#ff8c43" stopOpacity=".23" />
          <stop offset="65%" stopColor="#ff8c43" stopOpacity=".04" />
          <stop offset="100%" stopColor="#ff8c43" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-skin`} x1=".1" x2=".95" y1=".05" y2=".9">
          <stop offset="0%" stopColor={blend(colors.skin, 255, .21)} />
          <stop offset="40%" stopColor={colors.skin} />
          <stop offset="82%" stopColor={blend(colors.skin, 0, .13)} />
          <stop offset="100%" stopColor={blend(colors.skin, 0, .28)} />
        </linearGradient>
        <linearGradient id={`${id}-leg`} x1="0" x2="1" y1="0" y2=".6">
          <stop offset="0%" stopColor={colors.skin} />
          <stop offset="100%" stopColor={blend(colors.skin, 0, .25)} />
        </linearGradient>
        <linearGradient id={`${id}-shorts`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={shortsLight} />
          <stop offset="70%" stopColor={shortsDark} />
          <stop offset="100%" stopColor="#140e0b" />
        </linearGradient>
        <linearGradient id={`${id}-lime`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd195" />
          <stop offset="100%" stopColor="#c75828" />
        </linearGradient>
        <filter id={`${id}-glow`}><feGaussianBlur stdDeviation="15" /></filter>
      </defs>

      <ellipse cx="195" cy="227" rx="183" ry="208" fill={`url(#${id}-halo)`} />
      <g fill="none" stroke="#d27b42" strokeOpacity=".23">
        <path d="M195 21L347 174V319L195 475L43 319V174Z" strokeWidth="2" />
        <path d="M195 49L321 183V312L195 442L68 312V183Z" strokeWidth="1" strokeDasharray="5 9" />
        <path d="M195 41V10M195 445v30M9 226h38M344 226h37" />
      </g>
      <g fill="#ffb678" opacity=".60">
        <circle cx="71" cy="163" r="2" /><circle cx="313" cy="151" r="1.7" />
        <circle cx="306" cy="366" r="2.6" /><circle cx="79" cy="384" r="1.6" />
      </g>
      <ellipse cx="195" cy="473" rx="125" ry="15" fill="#fd9b56" opacity=".18" filter={`url(#${id}-glow)`} />
      <ellipse cx="195" cy="472" rx="93" ry="8" fill="#050708" opacity=".55" />

      {/* Legs and shoes */}
      <path d="M150 314 Q144 346 151 378 L147 427 Q142 442 148 448 L170 451 Q181 444 178 429 L190 354 L196 329Z" fill={`url(#${id}-leg)`} stroke="#714739" strokeWidth="2" />
      <path d="M235 314 Q246 348 238 379 L243 427 Q249 440 241 449 L218 451 Q209 445 212 428 L200 354 L195 329Z" fill={`url(#${id}-leg)`} stroke="#714739" strokeWidth="2" />
      <path d="M153 420Q164 426 177 422L175 453L147 453Z" fill={shortsDark} />
      <path d="M213 421Q226 426 239 419L245 453L215 454Z" fill={shortsDark} />
      <path d="M145 442Q149 437 161 440L180 449Q186 457 183 463L142 466Q133 459 145 442Z" fill="#e3d4c5" stroke="#788080" strokeWidth="2" />
      <path d="M242 441Q233 437 221 440L207 450Q204 460 211 464L253 464Q258 457 242 441Z" fill="#e3d4c5" stroke="#788080" strokeWidth="2" />
      <path d="M146 455h37M209 456h44" stroke={accent} strokeWidth="3" />

      {/* Arms behind torso, muscles become wider with completed workouts */}
      <path d={`M${195 - shoulder + 3} 159 Q${106 - power * 5} 160 ${103 - power * 4} 194 L${91 - power * 5} 261 Q${88 - power * 4} 278 ${99 - power * 4} 292 L${113 - power * 3} 296 Q${124 - power * 2} 288 ${125 - power * 3} 271 L${141 - power * 2} 214 L${153 - power * 2} 178Z`} fill={`url(#${id}-skin)`} stroke="#7c4937" strokeWidth="2" />
      <path d={`M${195 + shoulder - 3} 159 Q${284 + power * 5} 160 ${286 + power * 4} 194 L${299 + power * 5} 261 Q${303 + power * 4} 278 ${291 + power * 4} 292 L${277 + power * 3} 296 Q${266 + power * 2} 288 ${264 + power * 3} 271 L${250 + power * 2} 214 L${237 + power * 2} 178Z`} fill={`url(#${id}-skin)`} stroke="#7c4937" strokeWidth="2" />
      <path d={`M${124 - power * 3} 203 Q${104 - power * 3 - arm / 4} 222 ${112 - power * 3} 243`} stroke="#ffe0b7" strokeOpacity=".38" strokeWidth={2 + power / 2} fill="none" strokeLinecap="round" />
      <path d={`M${265 + power * 3} 203 Q${286 + power * 3 + arm / 4} 222 ${279 + power * 3} 243`} stroke="#ffe0b7" strokeOpacity=".38" strokeWidth={2 + power / 2} fill="none" strokeLinecap="round" />
      {/* Hands */}
      <path d={`M${98 - power * 4} 283q-8 5-5 23l9 14q9 4 14-6l4-19Z`} fill="#bd7d61" />
      <path d={`M${290 + power * 4} 283q8 5 5 23l-9 14q-9 4-14-6l-4-19Z`} fill="#bd7d61" />

      {/* Neck and torso */}
      <path d="M177 130L179 163Q195 176 212 163L214 130Z" fill="#b67358" />
      <path d={`M${195 - shoulder} 160 Q${195 - shoulder - 8} 182 ${143 - power * 3} 211 L${153 - power * 1.5 - extraWaist} 291 Q${157 - extraWaist} 317 ${171 - extraWaist} 338 L${219 + extraWaist} 338 Q${232 + extraWaist} 317 ${237 + power * 1.5 + extraWaist} 291 L${247 + power * 3} 211 Q${195 + shoulder + 8} 182 ${195 + shoulder} 160 L218 154 Q195 168 172 154Z`} fill={`url(#${id}-skin)`} stroke="#784737" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Chest contours */}
      <path d={`M${170 - power * 1.3} 192 Q147 207 163 230 Q178 241 194 229 L194 189M${220 + power * 1.3} 192 Q243 207 227 230 Q212 241 196 229 L196 189`} fill="none" stroke="#7d4b3b" strokeOpacity={chestOpacity} strokeWidth={2 + power * 0.6} strokeLinecap="round" />
      <path d="M166 196Q180 188 191 199M224 196Q210 188 199 199" fill="none" stroke="#ffe1bd" strokeOpacity=".4" strokeWidth="2.3" />
      {/* Abdominal definition */}
      <g fill="none" stroke="#6f4336" strokeLinecap="round" strokeOpacity={absOpacity} strokeWidth={1.2 + power * 0.28}>
        <path d="M195 238v80" />
        <path d="M173 246Q183 253 190 246M200 246Q208 253 218 246" />
        <path d="M175 265Q185 272 191 265M199 265Q207 272 216 265" />
        <path d="M177 285Q186 293 191 285M199 285Q207 293 214 285" />
        <path d="M181 306Q188 310 191 306M199 306Q204 311 211 306" />
      </g>
      <path d="M163 251Q161 285 173 316M227 251Q230 284 218 316" stroke="#ffcead" strokeOpacity=".22" strokeWidth="3" fill="none" />
      {legLevel > 0 && <g stroke="#ffd0af" strokeWidth={1.3 + legLevel * 0.65} strokeOpacity={Math.min(.8, .17 + legLevel * .13)} fill="none">
        <path d="M156 348Q166 353 174 342M215 342Q227 354 238 348" />
        <path d="M151 369Q163 378 176 362M214 362Q229 378 240 369" />
      </g>}

      {/* Shorts and belt */}
      <path d="M160 321Q195 331 230 321L242 380L200 383L195 358L190 383L148 380Z" fill={`url(#${id}-shorts)`} stroke="#121718" strokeWidth="2" />
      <path d="M159 324Q195 332 231 323" stroke={accent} strokeWidth="7" fill="none" />
      <rect x="185" y="322" width="20" height="11" rx="3" fill="#222b2d" stroke={accent} strokeWidth="2" />
      {outfit !== 'base' && <g fill="none" stroke={accent} strokeWidth="3" opacity=".9">
        <path d="M157 347L167 355M229 349L221 356" />
        <path d="M172 160L195 172L219 160" strokeWidth="2" />
      </g>}
      <path d="M156 367L181 369M207 369L235 366" stroke="#a17965" strokeOpacity=".5" strokeWidth="2" />

      {/* Human head: ears, jaw, hair and facial features */}
      <ellipse cx="158" cy="100" rx="8" ry="14" fill="#b57759" />
      <ellipse cx="232" cy="100" rx="8" ry="14" fill="#b57759" />
      <path d="M154 75Q156 46 195 42Q232 46 236 79L232 109Q229 131 207 144L183 144Q161 133 158 109Z" fill={`url(#${id}-skin)`} stroke="#84503d" strokeWidth="2" />
      <path d="M153 78Q145 50 166 39Q180 31 193 36Q212 25 232 44Q247 56 235 82Q230 71 224 63Q209 69 197 58Q178 72 158 68Z" fill={colors.hair} />
      <path d="M158 66Q170 46 189 52M207 45Q226 44 235 61" fill="none" stroke={blend(colors.hair, 255, .23)} strokeWidth="3" strokeOpacity=".5" />
      <path d="M171 92l16-3M203 89l16 3" stroke="#332925" strokeWidth="4" strokeLinecap="round" />
      <path d="M175 98h10M205 98h10" stroke="#2a1a13" strokeWidth="3" strokeLinecap="round" />
      <path d="M195 100l-4 16h7" fill="none" stroke="#935b45" strokeWidth="2" strokeLinecap="round" />
      <path d="M185 127q10 5 20 0" fill="none" stroke="#6a3c32" strokeWidth="2" strokeLinecap="round" />
      <path d="M181 144q15 5 28 0" stroke="#834836" strokeWidth="2" fill="none" />

      {look.visor && <g aria-hidden="true"><rect x="162" y="88" width="66" height="21" rx="9" fill={colors.trim} fillOpacity=".3" stroke={colors.trim} strokeWidth="2"/><path d="M166 96h58" stroke={colors.trim} strokeWidth="2" strokeOpacity=".7"/></g>}

      {/* Upgrade aura */}
      {power > 0 && (
        <g fill="none" stroke={`url(#${id}-lime)`} strokeWidth="2" strokeLinecap="round" opacity={0.35 + power * 0.13}>
          <path d="M76 192l-12-19 14-26" />
          <path d="M311 192l13-19-13-26" />
          {power >= 3 && <path d="M104 95l-20-9 11-24M286 95l20-9-11-24" />}
        </g>
      )}
    </svg>
  );
}
