'use client';

interface DictionaryPanelProps {
  words: string[];
  onInsert: (word: string) => void;
}

export function DictionaryPanel({ words, onInsert }: DictionaryPanelProps) {
  if (words.length === 0) return null;

  return (
    <div className="p-3 bg-neutral-800 border-t border-neutral-700 text-xs text-neutral-400">
      <strong className="text-neutral-300">Dictionary:</strong>{' '}
      {words.map((word) => (
        <span
          key={word}
          onClick={() => onInsert(word)}
          className="inline-block bg-neutral-700 px-2 py-0.5 mx-0.5 my-0.5 rounded cursor-pointer hover:bg-green-600 hover:text-white transition-colors"
        >
          {word}
        </span>
      ))}
    </div>
  );
}
