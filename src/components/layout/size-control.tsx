import { Minus, Plus, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_PRESETS,
  UI_SCALE_STEP,
  useUIScale,
} from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

/**
 * Größenregler: skaliert die gesamte Oberfläche live. Voreinstellungen für
 * verlässliche Auswahl, Schieberegler + Schritte für Feinjustage.
 * Gedacht zum Ausprobieren, bevor die finale Größe festgelegt wird.
 */
export function SizeControl() {
  const { scale, setScale, reset } = useUIScale();
  const percent = Math.round(scale * 100);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <Type className="size-4" />
          <span className="tabular-nums">{percent}%</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Darstellungsgröße</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{percent}%</span>
          </div>

          {/* Voreinstellungen */}
          <div className="grid grid-cols-4 gap-1.5">
            {UI_SCALE_PRESETS.map((preset) => {
              const active = Math.abs(scale - preset.value) < 0.001;
              return (
                <button
                  key={preset.label}
                  onClick={() => setScale(preset.value)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs transition-colors",
                    active
                      ? "border-brand bg-brand text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-brand/40 hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Feinjustage: Schritt − / Slider / Schritt + */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setScale(scale - UI_SCALE_STEP)}
              aria-label="Kleiner"
            >
              <Minus className="size-4" />
            </Button>
            <Slider
              value={[scale]}
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              onValueChange={([value]) => setScale(value)}
              aria-label="Darstellungsgröße"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setScale(scale + UI_SCALE_STEP)}
              aria-label="Größer"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">
              Größe live anpassen, bevor sie festgelegt wird.
            </span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={reset}>
              Zurücksetzen
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
