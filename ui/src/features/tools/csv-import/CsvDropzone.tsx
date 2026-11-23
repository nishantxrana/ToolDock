import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';

interface CsvDropzoneProps {
  onFile: (text: string, filename: string) => void;
}

/** Drag-and-drop / click-to-upload zone for a CSV file, with paste fallback. */
export function CsvDropzone({ onFile }: CsvDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setTypeError(true);
      return;
    }
    setTypeError(false);
    const reader = new FileReader();
    reader.onload = () => onFile(String(reader.result ?? ''), file.name);
    reader.readAsText(file);
  };

  if (pasteMode) {
    return (
      <div className="space-y-3">
        <Textarea
          autoFocus
          aria-label="CSV text"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'Key,Value\nNODE_ENV,production\nAPI_URL,https://api.contoso.com'}
          className="min-h-[160px]"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => pasteText.trim() && onFile(pasteText, 'pasted.csv')}
            disabled={!pasteText.trim()}
          >
            Preview import
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPasteMode(false);
              setPasteText('');
            }}
          >
            Upload a file instead
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
          setTypeError(false);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Choose a CSV file"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging
            ? 'border-primary bg-accent'
            : 'border-border-strong/60 bg-muted/40 hover:border-primary/60 hover:bg-accent/50',
          typeError && 'border-destructive-border bg-destructive-subtle',
        )}
      >
        <FileUp
          className={cn('h-7 w-7', typeError ? 'text-destructive' : 'text-muted-foreground')}
          strokeWidth={1.5}
        />
        {typeError ? (
          <>
            <p className="text-sm font-semibold text-destructive">That isn’t a .csv file</p>
            <p className="text-xs text-muted-foreground">
              Drop a .csv file, or click to choose one.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">
              {dragging ? 'Drop to preview' : 'Drop a CSV file here, or click to choose one'}
            </p>
            <p className="text-xs text-muted-foreground">
              Two columns, <code>Key,Value</code>. A header row is optional.
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        No file?{' '}
        <button
          type="button"
          onClick={() => setPasteMode(true)}
          className="rounded font-medium text-foreground underline decoration-border-strong underline-offset-[3px] transition-colors hover:decoration-foreground"
        >
          Paste CSV text
        </button>
      </p>
    </div>
  );
}
