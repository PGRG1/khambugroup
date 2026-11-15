import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DEFAULT_PLACE, HKO_URL, WEATHER_WORD, readHkoWeather, todayLabel, type WeatherKind } from "@/utils/topBarToday";
import { HKO_WARNINGS_URL, readHkoSignal, skyFromIcons, type SkySignal } from "@/utils/topBarSky";
import { TopBarSky } from "@/components/TopBarSky";

function WeatherIcon({ kind, day }: { kind: WeatherKind; day: boolean }) {
  const cls = "h-[15px] w-[15px] shrink-0";
  if (kind === "clear") return day ? <Sun className={cls} aria-hidden /> : <Moon className={cls} aria-hidden />;
  if (kind === "partly") return day ? <CloudSun className={cls} aria-hidden /> : <CloudMoon className={cls} aria-hidden />;
  if (kind === "fog") return <CloudFog className={cls} aria-hidden />;
  if (kind === "drizzle") return <CloudDrizzle className={cls} aria-hidden />;
  if (kind === "rain") return <CloudRain className={cls} aria-hidden />;
  if (kind === "snow") return <CloudSnow className={cls} aria-hidden />;
  if (kind === "storm") return <CloudLightning className={cls} aria-hidden />;
  return <Cloud className={cls} aria-hidden />;
}

/** Quiet top-bar line: today's date and the Hong Kong Observatory's current reading, over a live sky for the
 *  Hong Kong time and weather (rainstorm and typhoon signals included). If the reading can't load, only the date shows. */
export function TopBarToday() {
  const isMobile = useIsMobile();
  const [now, setNow] = useState(() => new Date());
  const [wx, setWx] = useState<ReturnType<typeof readHkoWeather>>(null);
  const [icons, setIcons] = useState<number[]>([]);
  const [signal, setSignal] = useState<SkySignal | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [res, warn] = await Promise.all([fetch(HKO_URL), fetch(HKO_WARNINGS_URL).catch(() => null)]);
        if (warn?.ok) { const sig = readHkoSignal(await warn.json().catch(() => null)); if (alive) setSignal(sig); }
        if (!res.ok) return;
        const json = await res.json();
        const next = readHkoWeather(json);
        if (alive && next) { setWx(next); setIcons(Array.isArray(json?.icon) ? json.icon.filter((c: unknown): c is number => typeof c === "number") : []); }
      } catch { /* offline or blocked: the date still shows */ }
    };
    void load();
    const t = setInterval(load, 10 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // A warning in force decides the sky; otherwise the Observatory's icon does.
  const sky = signal?.key ?? (wx ? skyFromIcons(icons) : "partly");

  return (
    <div className="topbar-today flex min-w-0 items-center gap-2.5 whitespace-nowrap text-[13px] text-muted-foreground">
      <TopBarSky sky={sky} />
      <span className="font-medium text-foreground/85">{todayLabel(now, isMobile)}</span>
      {wx && <>
        <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
        <span className="inline-flex min-w-0 items-center gap-1.5" title={`${WEATHER_WORD[wx.kind]}, ${wx.temp}°C at the ${DEFAULT_PLACE.station}`} aria-label={`${WEATHER_WORD[wx.kind]}, ${wx.temp} degrees, ${DEFAULT_PLACE.city}`}>
          <WeatherIcon kind={wx.kind} day={wx.day} />{wx.temp}°{!isMobile && <span className="truncate">{DEFAULT_PLACE.city}</span>}
        </span>
      </>}
      {signal && <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-black/10 px-2 text-[11px] font-semibold" style={{ background: signal.bg, color: signal.fg }} title="Warning in force from the Hong Kong Observatory">{signal.label}</span>}
    </div>
  );
}
