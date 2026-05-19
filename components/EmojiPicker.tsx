import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

// Categorías de emojis estilo teclado del móvil
const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: 'Caras',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇',
      '🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
      '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔',
      '🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮',
      '😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤬',
      '🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗',
      '🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧',
      '😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡',
      '💩','👻','💀','☠️','👽','👾','🤖','🎃'
    ],
  },
  {
    name: 'Gente',
    icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞',
      '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
      '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝',
      '🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻',
      '👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸'
    ],
  },
  {
    name: 'Corazones',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️',
      '💌','💋','💯','💢','💥','💫','💦','💨','🕳️','💣',
      '💬','👁️‍🗨️','🗨️','🗯️','💭','💤'
    ],
  },
  {
    name: 'Salud',
    icon: '🧘',
    emojis: [
      '🧘','🧘‍♀️','🧘‍♂️','💆','💆‍♀️','💆‍♂️','💇','🛌','🛀','🩹',
      '🩺','💊','💉','🧬','🧠','🫀','🫁','🦷','🦴','👁️',
      '👂','👃','🦾','🌿','🌱','🍀','🌸','🌼','🌻','🌷',
      '🍵','☕','🥛','🍯','🧃','🍎','🥦','🥗','🏃','🚶',
      '🧗','🏋️','🤸','🤾','⛹️','🏊','🚴','🛌','💤','🌙'
    ],
  },
  {
    name: 'Símbolos',
    icon: '⭐',
    emojis: [
      '⭐','🌟','✨','⚡','🔥','💥','💫','🌈','☀️','🌤️',
      '⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️',
      '⛄','🌬️','💨','🌪️','🌫️','🌊','💧','💦','☔','⚠️',
      '✅','❌','⭕','🚫','✔️','❎','💯','🔴','🟠','🟡',
      '🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹',
      '🔶','🔷','🔳','🔲','♻️','💠','🆗','🆕','🆒','🆙'
    ],
  },
  {
    name: 'Objetos',
    icon: '📌',
    emojis: [
      '📌','📍','📎','🖇️','📏','📐','✂️','🗒️','🗓️','📅',
      '📆','🗂️','📁','📂','📋','📊','📈','📉','📝','✏️',
      '🖊️','🖋️','✒️','🖌️','🖍️','📒','📔','📕','📗','📘',
      '📙','📚','📖','🔖','🏷️','💼','👜','🎒','💰','💳',
      '💻','⌨️','🖥️','🖨️','🖱️','📱','☎️','📞','📟','📠',
      '🔔','🔕','📣','📢','📯','🎵','🎶','🎤','🎧','🎬',
      '🎥','📷','📸','📹','📺','📻','🕰️','⏰','⏲️','⌛',
      '🎁','🎈','🎉','🎊','🏆','🥇','🥈','🥉','🏅','🎖️'
    ],
  },
];

const RECENT_KEY = 'mainds_recent_emojis';
const MAX_RECENT = 24;

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(e => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(emoji: string) {
  try {
    const cur = getRecent().filter(e => e !== emoji);
    cur.unshift(emoji);
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

interface EmojiPickerProps {
  value?: string;
  onChange: (emoji: string) => void;
  label?: string;
  placeholder?: string;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ value, onChange, label, placeholder = 'Selecciona un emoji' }) => {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => getRecent());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    pushRecent(emoji);
    setRecent(getRecent());
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className="relative" ref={ref}>
      {label && (
        <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 border border-slate-300 rounded-xl bg-white hover:bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors text-base"
      >
        <span className="flex items-center gap-2">
          {value ? (
            <span className="text-2xl leading-none">{value}</span>
          ) : (
            <span className="text-slate-400 text-sm">{placeholder}</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as any); }}
              className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-700"
              title="Quitar emoji"
            >
              <X size={14} />
            </span>
          )}
          <span className="text-slate-400 text-xs">▼</span>
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 right-0 sm:right-auto sm:w-[340px] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          {/* Category tabs */}
          <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-slate-100 overflow-x-auto">
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategory(-1)}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-base transition-colors ${activeCategory === -1 ? 'bg-purple-100' : 'hover:bg-slate-100'}`}
                title="Recientes"
              >
                🕘
              </button>
            )}
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(idx)}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-base transition-colors ${activeCategory === idx ? 'bg-purple-100' : 'hover:bg-slate-100'}`}
                title={cat.name}
              >
                {cat.icon}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="p-2 max-h-[260px] overflow-y-auto">
            <div className="grid grid-cols-8 gap-0.5">
              {(activeCategory === -1 ? recent : EMOJI_CATEGORIES[activeCategory].emojis).map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className="text-2xl leading-none p-1.5 rounded-md hover:bg-purple-100 active:bg-purple-200 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmojiPicker;
