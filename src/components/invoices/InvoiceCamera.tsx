import React, { useRef, useState, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, Trash2, Plus, ImageIcon, Flashlight, Crop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface InvoiceCameraProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const generateFileName = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-SCAN-${date}-${time}-${rand}`;
};

type CaptureItem = { dataUrl: string; blob: Blob };

const InvoiceCamera = ({ onCapture, onClose }: InvoiceCameraProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);

  // Crop state — shown right after capture
  const [cropMode, setCropMode] = useState(false);
  const [cropTarget, setCropTarget] = useState<number | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropDragging, setCropDragging] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);

  // ─── Camera start ───
  const startCamera = useCallback(async (facing: "environment" | "user") => {
    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1920 } },
        audio: false,
      });

      streamRef.current = mediaStream;

      // Attach to video element if already mounted
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);

      // Check torch & zoom support
      const track = mediaStream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as any;
      setTorchSupported(!!caps?.torch);
      setTorchOn(false);
      if (caps?.zoom) {
        setZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
        setZoomLevel(caps.zoom.min);
      } else {
        setZoomRange(null);
        setZoomLevel(1);
      }
      setError(null);
    } catch (err) {
      console.error("Camera error:", err);
      setError("Could not access camera. Please ensure camera permissions are granted.");
    }
  }, []);

  // Ref callback — when the <video> element mounts, attach the stream and play
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
      setCameraReady(true);
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    setTorchOn(false);
    startCamera(next);
  };
  // Pinch-to-zoom
  const lastPinchDist = useRef<number | null>(null);

  const handleViewfinderTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
    }
  }, []);

  const handleViewfinderTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !zoomRange || lastPinchDist.current === null) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const delta = (dist - lastPinchDist.current) * 0.01;
    lastPinchDist.current = dist;

    const newZoom = Math.min(zoomRange.max, Math.max(zoomRange.min, zoomLevel + delta * (zoomRange.max - zoomRange.min)));
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    (track as any).applyConstraints({ advanced: [{ zoom: newZoom }] }).catch(() => {});
    setZoomLevel(newZoom);
  }, [zoomRange, zoomLevel]);

  const handleViewfinderTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch (err) {
      console.error("Torch error:", err);
    }
  }, [torchOn]);

  // ─── Take photo → auto crop prompt ───
  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        setCaptures((prev) => {
          const newCaptures = [...prev, { dataUrl, blob }];
          // Auto-open crop for the newly captured page
          setCropTarget(newCaptures.length - 1);
          setCropMode(true);
          setCropRect(null);
          return newCaptures;
        });
      },
      "image/jpeg",
      0.92
    );
  }, []);

  const removeCapture = (index: number) => {
    setCaptures((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Crop logic ───
  const startCrop = (index: number) => {
    setCropMode(true);
    setCropTarget(index);
    setCropRect(null);
  };

  const cancelCrop = () => {
    setCropMode(false);
    setCropTarget(null);
    setCropRect(null);
  };

  // Skip crop = keep as-is
  const skipCrop = () => {
    cancelCrop();
  };

  const getPointerPos = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleCropPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pos = getPointerPos(canvas, e.clientX, e.clientY);
    setCropStart(pos);
    setCropDragging(true);
    setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cropDragging || !cropStart) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const pos = getPointerPos(canvas, e.clientX, e.clientY);
    setCropRect({
      x: Math.min(cropStart.x, pos.x),
      y: Math.min(cropStart.y, pos.y),
      w: Math.abs(pos.x - cropStart.x),
      h: Math.abs(pos.y - cropStart.y),
    });
  };

  const handleCropPointerUp = () => {
    setCropDragging(false);
  };

  const applyCrop = useCallback(() => {
    if (cropTarget === null || !cropRect || cropRect.w < 10 || cropRect.h < 10) return;
    const cap = captures[cropTarget];
    if (!cap) return;

    const img = new Image();
    img.onload = () => {
      const cropCanvas = cropCanvasRef.current;
      if (!cropCanvas) return;
      const displayW = cropCanvas.width;
      const displayH = cropCanvas.height;
      const scaleX = img.width / displayW;
      const scaleY = img.height / displayH;

      const sx = cropRect.x * scaleX;
      const sy = cropRect.y * scaleY;
      const sw = cropRect.w * scaleX;
      const sh = cropRect.h * scaleY;

      const outCanvas = document.createElement("canvas");
      outCanvas.width = sw;
      outCanvas.height = sh;
      const ctx = outCanvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      outCanvas.toBlob(
        (blob) => {
          if (!blob) return;
          const dataUrl = outCanvas.toDataURL("image/jpeg", 0.92);
          setCaptures((prev) => {
            const copy = [...prev];
            copy[cropTarget] = { dataUrl, blob };
            return copy;
          });
          cancelCrop();
        },
        "image/jpeg",
        0.92
      );
    };
    img.src = cap.dataUrl;
  }, [cropTarget, cropRect, captures]);

  // Draw crop overlay
  useEffect(() => {
    if (!cropMode || cropTarget === null) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const cap = captures[cropTarget];
    if (!cap) return;

    const img = new Image();
    img.onload = () => {
      const container = canvas.parentElement;
      const maxW = container?.clientWidth || 400;
      const maxH = container?.clientHeight || 600;
      const imgRatio = img.width / img.height;
      let w = maxW;
      let h = maxW / imgRatio;
      if (h > maxH) {
        h = maxH;
        w = maxH * imgRatio;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, w, h);
        ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
        // Corner handles
        const corners = [
          { x: cropRect.x, y: cropRect.y },
          { x: cropRect.x + cropRect.w, y: cropRect.y },
          { x: cropRect.x, y: cropRect.y + cropRect.h },
          { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h },
        ];
        ctx.setLineDash([]);
        ctx.fillStyle = "#fff";
        for (const c of corners) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    img.src = cap.dataUrl;
  }, [cropMode, cropTarget, cropRect, captures]);

  const handleDone = useCallback(async () => {
    if (captures.length === 0) return;
    setProcessing(true);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const fileName = generateFileName();

    if (captures.length === 1) {
      const file = new File([captures[0].blob], `${fileName}.jpg`, { type: "image/jpeg" });
      onCapture(file);
    } else {
      const images = await Promise.all(
        captures.map(
          (c) =>
            new Promise<HTMLImageElement>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.src = c.dataUrl;
            })
        )
      );

      const maxWidth = Math.max(...images.map((img) => img.width));
      const totalHeight = images.reduce((sum, img) => sum + (img.height * maxWidth) / img.width, 0);

      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d")!;

      let y = 0;
      for (const img of images) {
        const scaledHeight = (img.height * maxWidth) / img.width;
        ctx.drawImage(img, 0, y, maxWidth, scaledHeight);
        y += scaledHeight;
      }

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.90);
      });

      const file = new File([blob], `${fileName}.jpg`, { type: "image/jpeg" });
      onCapture(file);
    }
  }, [captures, onCapture]);

  // ─── Crop Mode UI (fullscreen) ───
  if (cropMode && cropTarget !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-white" />
            <h3 className="text-sm font-semibold text-white">Crop Page {cropTarget + 1}</h3>
          </div>
          <button onClick={skipCrop} className="text-white/70 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-white/60 px-4 pb-2">
          Draw over the area to keep, or skip to use the full image.
        </p>

        {/* Crop canvas */}
        <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
          <canvas
            ref={cropCanvasRef}
            className="max-w-full max-h-full cursor-crosshair touch-none"
            onPointerDown={handleCropPointerDown}
            onPointerMove={handleCropPointerMove}
            onPointerUp={handleCropPointerUp}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4">
          <Button variant="outline" onClick={skipCrop} className="flex-1 border-white/20 text-foreground hover:bg-white/10">
            Skip
          </Button>
          <Button
            onClick={applyCrop}
            disabled={!cropRect || cropRect.w < 10 || cropRect.h < 10}
            className="flex-1"
          >
            <Check className="h-4 w-4 mr-1" />Apply Crop
          </Button>
        </div>
      </div>
    );
  }

  // ─── Main Camera UI (always fullscreen) ───
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 z-10">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-white" />
          <h3 className="text-sm font-semibold text-white">Scan Invoice</h3>
          {captures.length > 0 && (
            <Badge variant="secondary" className="text-xs bg-white/20 text-white border-0">
              {captures.length} page{captures.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="mx-4 bg-destructive/20 text-white text-sm rounded-lg p-3">{error}</div>
      )}

      {/* Camera viewfinder — takes all available space */}
      <div
        className="flex-1 relative overflow-hidden touch-none"
        onTouchStart={handleViewfinderTouchStart}
        onTouchMove={handleViewfinderTouchMove}
        onTouchEnd={handleViewfinderTouchEnd}
      >
        {!cameraReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-white/60">
              <Camera className="h-8 w-8 animate-pulse" />
              <span className="text-sm">Starting camera...</span>
            </div>
          </div>
        )}
        <video
          ref={setVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${cameraReady ? "opacity-100" : "opacity-0"}`}
        />

        {/* Zoom indicator */}
        {cameraReady && zoomRange && zoomLevel > zoomRange.min + 0.05 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/50 rounded-full px-3 py-1 z-10">
            <span className="text-white text-xs font-medium">{zoomLevel.toFixed(1)}x</span>
          </div>
        )}

        {/* Shutter + controls overlay at bottom of viewfinder */}
        {cameraReady && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-6 flex items-center justify-center gap-8">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleCamera}
              className="text-white hover:bg-white/20 h-12 w-12"
            >
              <RotateCcw className="h-6 w-6" />
            </Button>

            <button
              onClick={takePhoto}
              className="h-18 w-18 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-95 transition-all flex items-center justify-center"
              style={{ width: 72, height: 72 }}
            >
              <div className="rounded-full bg-white" style={{ width: 56, height: 56 }} />
            </button>

            {torchSupported ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleTorch}
                className={`h-12 w-12 ${torchOn ? "text-yellow-400 bg-white/20" : "text-white hover:bg-white/20"}`}
              >
                <Flashlight className="h-6 w-6" />
              </Button>
            ) : (
              <div className="w-12" />
            )}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Captured pages strip at bottom */}
      {captures.length > 0 && (
        <div className="bg-black/90 px-4 py-3 space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {captures.map((cap, i) => (
              <div key={i} className="relative shrink-0 w-16 h-22 rounded-md overflow-hidden border border-white/20">
                <img src={cap.dataUrl} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute top-0.5 left-0.5">
                  <Badge className="text-[9px] px-1 py-0 bg-black/70 text-white border-0">
                    {i + 1}
                  </Badge>
                </div>
                <div className="absolute bottom-0 inset-x-0 flex justify-center gap-1 pb-0.5">
                  <button
                    onClick={() => startCrop(i)}
                    className="bg-black/70 text-white rounded-full p-1"
                    title="Crop"
                  >
                    <Crop className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeCapture(i)}
                    className="bg-black/70 text-white rounded-full p-1"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={takePhoto}
              className="shrink-0 w-16 h-22 rounded-md border-2 border-dashed border-white/30 flex flex-col items-center justify-center text-white/50 hover:border-white/60 hover:text-white/80 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="text-[9px] mt-0.5">Add</span>
            </button>
          </div>

          <Button onClick={handleDone} disabled={processing} className="w-full">
            {processing ? (
              <span className="flex items-center gap-1">
                <ImageIcon className="h-4 w-4 animate-pulse" />Processing...
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Check className="h-4 w-4" />
                Done — Scan {captures.length} page{captures.length > 1 ? "s" : ""}
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default InvoiceCamera;
