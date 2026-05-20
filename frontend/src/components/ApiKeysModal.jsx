import { useState, useEffect } from 'react';

const PROVIDERS = [
  {
    key:         'groq_api_key',
    label:       'Groq',
    placeholder: 'gsk_...',
    url:         'https://console.groq.com/keys',
    color:       '#f97316',
    models:      'Llama 3.1 8B, Llama 3.3 70B',
  },
  {
    key:         'openai_api_key',
    label:       'OpenAI',
    placeholder: 'sk-...',
    url:         'https://platform.openai.com/api-keys',
    color:       '#10b981',
    models:      'GPT-4o Mini, GPT-4o',
  },
  {
    key:         'anthropic_api_key',
    label:       'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    url:         'https://console.anthropic.com/settings/keys',
    color:       '#8b5cf6',
    models:      'Claude Haiku, Claude Sonnet',
  },
];

export default function ApiKeysModal({ onClose }) {
  const [values, setValues]   = useState({});
  const [visible, setVisible] = useState({});
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    const loaded = {};
    PROVIDERS.forEach(p => { loaded[p.key] = localStorage.getItem(p.key) || ''; });
    setValues(loaded);
  }, []);

  function handleSave() {
    PROVIDERS.forEach(p => {
      const v = values[p.key]?.trim();
      if (v) localStorage.setItem(p.key, v);
      else   localStorage.removeItem(p.key);
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#13131f] border border-[#2a2a3e] rounded-2xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a3e]">
          <div>
            <p className="text-sm font-semibold text-[#e8e8f0]">API Keys</p>
            <p className="text-xs text-[#555570] mt-0.5">Keys are saved in your browser only — never sent to our servers.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#2a2a3e] text-[#555570] hover:text-[#e8e8f0] transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider rows */}
        <div className="p-5 space-y-4">
          {PROVIDERS.map(p => {
            const hasKey = !!values[p.key]?.trim();
            return (
              <div key={p.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hasKey ? p.color : '#555570' }} />
                    <span className="text-xs font-semibold text-[#e8e8f0]">{p.label}</span>
                    <span className="text-[10px] text-[#555570]">{p.models}</span>
                  </div>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] underline underline-offset-2 hover:opacity-80 transition"
                    style={{ color: p.color }}
                  >
                    Get key →
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={visible[p.key] ? 'text' : 'password'}
                    value={values[p.key] || ''}
                    onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))}
                    placeholder={p.placeholder}
                    className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-lg px-3 py-2 pr-10 text-xs text-[#e8e8f0] placeholder-[#555570] focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    onClick={() => setVisible(v => ({ ...v, [p.key]: !v[p.key] }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555570] hover:text-[#8888a8] transition"
                    tabIndex={-1}
                  >
                    {visible[p.key] ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleSave}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 rounded-xl transition flex items-center justify-center gap-2"
          >
            {saved ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Saved!
              </>
            ) : 'Save Keys'}
          </button>
        </div>
      </div>
    </div>
  );
}
