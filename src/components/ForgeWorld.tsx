import { useState } from 'react';
import {
  ArrowRight, CheckCircle2, ChevronRight, Coins, Crown, Flame, Footprints,
  Gift, Globe2, Hammer, LockKeyhole, Medal, Shirt, ShieldCheck,
  Swords, Target, Timer, UserRound, Zap,
} from 'lucide-react';
import GameAvatar from './GameAvatar';
import { canClaimQuest } from '../lib/game';
import {
  LOGIN_COINS, MUSCLES, OUTFITS, QUEST_COINS, QUEST_XP, TOWER_COINS,
  TOWER_FLOORS, TOWER_XP, localDay, muscleCost, nextTowerFloor,
  type BodyBuild, type Muscle, type Outfit,
} from '../lib/game';
import { formatTime, getLevel, type Profile } from '../lib/progression';

interface SetupProps {
  onCreate: (build: BodyBuild, nickname: string) => void;
  legacyWorkouts: number;
}

export function FighterSetup({ onCreate, legacyWorkouts }: SetupProps) {
  const [name, setName] = useState('БОЕЦ 01');
  const [build, setBuild] = useState<BodyBuild>('lean');
  return (
    <section className="forge-onboarding" id="onboarding" aria-label="Создание своего бойца">
      <div className="forge-heading"><span>ИСТОК КУЗНИ / 00</span><h2>СОЗДАЙ СВОЕГО <em>БОЙЦА</em></h2>
        <p>Начни с обычного человека. Его форму, мышцы и одежду изменят только твои тренировки.</p></div>
      {legacyWorkouts > 0 && <p className="legacy-note"><ShieldCheck size={16} /> Твои прежние тренировки и XP сохранены.</p>}
      <div className="forge-setup-layout">
        <div className="setup-avatar-preview"><GameAvatar workouts={0} build={build} muscles={{ arms: 0, core: 0, legs: 0, back: 0 }} outfit="base"/><span>БОЕЦ / СТАРТ</span></div>
        <div className="setup-controls">
          <label className="forge-field">ИМЯ БОЙЦА
            <input value={name} maxLength={20} onChange={(event) => setName(event.target.value)}
              autoComplete="off" placeholder="Как назовём героя?" aria-label="Имя персонажа" />
          </label>
          <div className="forge-field">ТЕЛОСЛОЖЕНИЕ</div>
          <div className="build-options" role="group" aria-label="Телосложение">
            <button className={build === 'lean' ? 'selected' : ''} aria-pressed={build === 'lean'}
              onClick={() => setBuild('lean')} type="button"><UserRound size={19} /><strong>СТРОЙНЫЙ</strong><span>Нарастить форму с нуля</span></button>
            <button className={build === 'solid' ? 'selected' : ''} aria-pressed={build === 'solid'}
              onClick={() => setBuild('solid')} type="button"><ShieldCheck size={19} /><strong>КРЕПКИЙ</strong><span>Закалить исходную силу</span></button>
          </div>
          <button className="forge-solid-button" type="button" disabled={name.trim().length < 2}
            onClick={() => onCreate(build, name)}>
            СОЗДАТЬ БОЙЦА <ArrowRight size={19} />
          </button>
          <span className="forge-footnote">Внешность меняется в игре. Твоё реальное тело не оценивается.</span>
        </div>
      </div>
    </section>
  );
}

interface DailyProps {
  profile: Profile;
  now: Date;
  onLogin: () => void;
  onClaimQuest: () => void;
  onTraining: () => void;
}
export function DailyBoard({ profile, now, onLogin, onClaimQuest, onTraining }: DailyProps) {
  const day = localDay(now);
  const loginClaimed = profile.game.lastLoginDay === day;
  const questClaimed = profile.game.lastQuestClaimDay === day;
  const questReady = canClaimQuest(profile, now);
  return (
    <section className="forge-section" id="quests" aria-label="Ежедневные задания">
      <div className="forge-heading"><span>МИССИИ / 01</span><h2>ЖАР <em>КАЖДЫЙ ДЕНЬ</em></h2><p>Короткий вход. Реальная тренировка. Настоящие награды для твоего персонажа.</p></div>
      <div className="quest-grid">
        <div className="quest-card">
          <div className="quest-icon"><Gift size={26}/></div>
          <div><strong>БОНУС ЗА ВХОД</strong><p>Вернулся в кузницу — получи монеты.</p>
            <span className="quest-reward"><Coins size={15}/> +{LOGIN_COINS} монет</span></div>
          <button type="button" disabled={loginClaimed || !profile.game.created} onClick={onLogin}
            className="quest-button">{loginClaimed ? <><CheckCircle2 size={16}/> ПОЛУЧЕНО</> : 'ЗАБРАТЬ'}</button>
        </div>
        <div className="quest-card">
          <div className="quest-icon"><Target size={26}/></div>
          <div><strong>КВЕСТ ДНЯ: 20 ПРИСЕДАНИЙ</strong><p>Сделай один честный заход с камерой.</p>
            <span className="quest-reward"><Zap size={15}/> +{QUEST_XP} XP <Coins size={14}/> +{QUEST_COINS}</span></div>
          <button type="button" disabled={questClaimed || !profile.game.created}
            onClick={questReady ? onClaimQuest : onTraining} className="quest-button">
            {questClaimed ? <><CheckCircle2 size={16}/> ГОТОВО</> : questReady ? 'ЗАБРАТЬ' : 'ВЫПОЛНИТЬ'}
          </button>
        </div>
      </div>
    </section>
  );
}

interface StudioProps {
  profile: Profile;
  onUpgrade: (muscle: Muscle) => void;
  onOutfit: (outfit: Outfit) => void;
  paused?: boolean;
}
export function ForgeStudio({ profile, onUpgrade, onOutfit, paused = false }: StudioProps) {
  const game = profile.game;
  const sum = MUSCLES.reduce((total, muscle) => total + game.muscles[muscle.id], 0);
  return (
    <section className="forge-section" id="forge" aria-label="Прокачка персонажа">
      <div className="forge-heading">
        <span>ПЕРСОНАЖ / 02</span><h2>ВЫКУЙ <em>СВОЮ ФОРМУ</em></h2>
        <p>Потрать заработанные монеты на мышцы и одежду. Внешность меняется прямо на персонаже.</p>
      </div>
      <div className="studio-layout">
        <div className="studio-preview"><span className="preview-kicker">ЭВОЛЮЦИЯ БОЙЦА</span>
          <GameAvatar workouts={profile.workouts.length} build={game.build} muscles={game.muscles} outfit={game.outfit} paused={paused}/>
          <strong>{game.nickname}</strong>
          <span className="preview-spec">LVL {getLevel(profile.xp)} · ЗАКАЛКА {sum}/20 · {game.build === 'lean' ? 'СТРОЙНЫЙ' : 'КРЕПКИЙ'}</span>
          <div className="studio-wallet"><Coins size={17}/> {profile.coins} МОНЕТ</div>
        </div>
        <div className="studio-content">
          <div className="forge-subheading"><Hammer size={18}/> ПРОКАЧКА МЫШЦ <span>МАКСИМУМ 5</span></div>
          <div className="muscle-grid">
            {MUSCLES.map((muscle) => {
              const level = game.muscles[muscle.id], cost = muscleCost(level);
              const capped = level >= 5, enough = profile.coins >= cost;
              return <div key={muscle.id} className="muscle-card">
                <div><strong>{muscle.label}</strong><span>{muscle.description}</span></div>
                <div className="muscle-pips" aria-label={`Уровень ${level} из 5`}>
                  {Array.from({ length: 5 }, (_, index) => <i key={index} className={index < level ? 'filled' : ''}/>)}
                </div>
                <button type="button" disabled={!game.created || capped || !enough} onClick={() => onUpgrade(muscle.id)}>
                  {capped ? 'МАКС.' : <><Coins size={14}/> {cost} · УЛУЧШИТЬ</>}</button>
              </div>;
            })}
          </div>
          <div className="forge-subheading"><Shirt size={18}/> ГАРДЕРОБ <span>ВЫБЕРИ ФОРМУ</span></div>
          <div className="outfit-grid">
            {OUTFITS.map((outfit) => {
              const owned = game.ownedOutfits.includes(outfit.id);
              const selected = game.outfit === outfit.id;
              return <button key={outfit.id} type="button"
                className={`outfit-item ${selected ? 'active' : ''}`}
                disabled={!game.created || selected || (!owned && profile.coins < outfit.price)}
                onClick={() => onOutfit(outfit.id)}>
                <span className={`outfit-swatch outfit-${outfit.id}`}><Shirt size={23}/></span>
                <strong>{outfit.label}</strong><small>{outfit.detail}</small>
                <span className="outfit-price">{selected ? 'НАДЕТО' : owned ? 'НАДЕТЬ' : <><Coins size={13}/> {outfit.price}</>}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

interface TowerProps {
  profile: Profile;
  onTower: () => void;
  onGhost: () => void;
}
export function TowerBoard({ profile, onTower, onGhost }: TowerProps) {
  const next = nextTowerFloor(profile.game);
  const complete = profile.game.highestClearedFloor >= TOWER_FLOORS.length;
  const ghost = profile.game.bestGhost;
  return (
    <section className="forge-section" id="tower" aria-label="Башня испытаний">
      <div className="forge-heading"><span>ОДИНОЧНЫЕ БИТВЫ / 03</span><h2>БАШНЯ <em>ИСПЫТАНИЙ</em></h2>
        <p>Пять этажей. Пять виртуальных соперников. Побеждай на реальной тренировке — поднимайся выше.</p></div>
      <div className="tower-layout">
        <div className="tower-floors">
          {TOWER_FLOORS.map((floor) => {
            const won = floor.floor <= profile.game.highestClearedFloor;
            const active = !complete && floor.floor === next.floor;
            return <div className={`tower-floor ${won ? 'won' : active ? 'active' : 'locked'}`} key={floor.floor}>
              <span className="floor-index">{String(floor.floor).padStart(2, '0')}</span>
              <div><strong>{floor.name.toUpperCase()}</strong><small>{floor.bot} · 20 ПРИСЕДАНИЙ</small></div>
              <span className="floor-time">{won ? <CheckCircle2 size={20}/> : !active ? <LockKeyhole size={18}/> : <Timer size={18}/>}{formatTime(floor.targetMs)}</span>
            </div>;
          })}
        </div>
        <div className="tower-challenge">
          <div className="tower-crown"><Crown size={32}/></div>
          <span className="tower-kicker">{complete ? 'БАШНЯ ПРОЙДЕНА' : `ЭТАЖ ${String(next.floor).padStart(2, '0')} · БОТ ${next.bot}`}</span>
          <h3>{complete ? 'ТВОЯ КУЗНИЦА ПОКОРЕНА' : `ПОБЕДИ ${next.name.toUpperCase()}`}</h3>
          <p>{complete ? 'Все этажи пройдены. Можно улучшать личный рекорд и вызывать собственную тень.'
            : `Засчитай 20 приседаний камерой быстрее ${formatTime(next.targetMs)}. Бот — заданный темп, а не живой игрок.`}</p>
          <div className="tower-prizes"><Zap size={16}/> +{TOWER_XP} XP <Coins size={16}/> +{TOWER_COINS} монет за первый проход</div>
          <button type="button" disabled={!profile.game.created || complete} onClick={onTower} className="forge-solid-button">
            <Swords size={19}/> {complete ? 'БАШНЯ ЗАВЕРШЕНА' : 'НАЧАТЬ БОЙ'} <ChevronRight size={17}/>
          </button>
        </div>
      </div>
      <div className="ghost-panel">
        <div className="ghost-symbol"><Footprints size={26}/></div>
        <div><strong>БОЙ СО СВОЕЙ ТЕНЬЮ</strong><p>{ghost
          ? `Рекорд: ${formatTime(ghost.durationMs)}. Сравнивай каждый повтор с записанным темпом своего лучшего захода.`
          : 'Сначала выполни 20 приседаний с камерой — приложение запомнит время каждого повтора.'}</p></div>
        <button type="button" disabled={!ghost || !profile.game.created} onClick={onGhost}>
          <Flame size={16}/> {ghost ? 'ДОГНАТЬ ТЕНЬ' : 'НЕТ ЗАПИСИ'}
        </button>
      </div>
    </section>
  );
}

export function OnlineBoard() {
  return (
    <section className="forge-section online-section" id="online" aria-label="Будущий онлайн">
      <div className="forge-heading"><span>СЕТЕВАЯ АРЕНА / 04</span><h2>МИРОВАЯ <em>КУЗНИЦА</em></h2>
        <p>Будущие аккаунты, PvP с равными соперниками, лиги и мировой рейтинг.</p></div>
      <div className="online-caution"><Globe2 size={28}/><div>
        <strong>ОНЛАЙН ЕЩЁ НЕ ПОДКЛЮЧЁН</strong>
        <p>Сейчас прогресс хранится только в этом браузере. Ни серверных аккаунтов, ни реальных соперников, ни опубликованных таблиц пока нет.</p>
      </div></div>
      <div className="online-feature-grid">
        <div><UserRound size={24}/><strong>АККАУНТЫ</strong><span>Синхронизация между устройствами</span><small>ПЛАНИРУЕТСЯ</small></div>
        <div><Swords size={24}/><strong>PvP</strong><span>Равные соперники и честные результаты</span><small>ПЛАНИРУЕТСЯ</small></div>
        <div><Medal size={24}/><strong>ЛИГИ</strong><span>Подбор по реальным достижениям</span><small>ПЛАНИРУЕТСЯ</small></div>
        <div><Globe2 size={24}/><strong>МИРОВОЙ РЕЙТИНГ</strong><span>Только результаты после проверки на сервере</span><small>ПЛАНИРУЕТСЯ</small></div>
      </div>
      <p className="online-privacy"><ShieldCheck size={16}/> Видеопоток не публикуется. Для публичных соревнований нужна отдельная система доверия к результатам.</p>
    </section>
  );
}
