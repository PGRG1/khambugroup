import React, { useRef, useState, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, Trash2, Plus, ImageIcon, Flashlight, Maximize2, Minimize2, Crop } from "lucide-react";
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

const InvoiceCamera = ({ onCapture, onClose }: InvoiceCameraProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captures, setCaptures] = useState<{ dataUrl: string; blob: Blob }[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // Crop state
  const [cropMode, setCropMode] = useState(false);
  const [cropTarget, setCropTarget] = useState<number | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropDragging, setCropDragging] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);

  

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
      }

      setStream(mediaStream);
      setCameraActive(true);
      setError(null);

      setTorchOn(false);
    } catch (err) {
      console.error("Camera error:", err);
      setError("Could not access camera. Please ensure camera permissions are granted.");
    }
  }, [stream]);

  // Attach stream to video element whenever stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    setVideoReady(false);

    const playVideo = async () => {
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) {
          resolve();
        } else {
          const onReady = () => {
            video.removeEventListener("loadedmetadata", onReady);
            resolve();
          };
          video.addEventListener("loadedmetadata", onReady);
        }
      });
      try { 
        await video.play(); 
        setVideoReady(true);
      } catch {}
    };
    playVideo();
  }, [stream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    setTorchOn(false);
    startCamera(next);
  };

  const toggleTorch = useCallback(async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const newState = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newState } as any] });
      setTorchOn(newState);
    } catch (err) {
      console.error("Torch failed:", err);
      setTorchSupported(false);
    }
  }, [stream, torchOn]);

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
        const dataUrl = canvas.toDataURL("image/png");
        setCaptures((prev) => {
          const newCaptures = [...prev, { dataUrl, blob }];
          // Auto-open crop for the newly captured photo
          setTimeout(() => {
            setCropMode(true);
            setCropTarget(newCaptures.length - 1);
            setCropRect(null);
          }, 100);
          return newCaptures;
        });
      },
      "image/png"
    );
  }, []);

  const removeCapture = (index: number) => {
    setCaptures((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Crop Logic ---
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

  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCropStart({ x, y });
    setCropDragging(true);
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropDragging || !cropStart) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCropRect({
      x: Math.min(cropStart.x, x),
      y: Math.min(cropStart.y, y),
      w: Math.abs(x - cropStart.x),
      h: Math.abs(y - cropStart.y),
    });
  };

  const handleCropMouseUp = () => {
    setCropDragging(false);
  };

  // Touch handlers for crop on mobile
  const handleCropTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;
    setCropStart({ x, y });
    setCropDragging(true);
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const handleCropTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!cropDragging || !cropStart || e.touches.length === 0) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;
    setCropRect({
      x: Math.min(cropStart.x, x),
      y: Math.min(cropStart.y, y),
      w: Math.abs(x - cropStart.x),
      h: Math.abs(y - cropStart.y),
    });
  };

  const handleCropTouchEnd = () => {
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
          const dataUrl = outCanvas.toDataURL("image/png");
          setCaptures((prev) => {
            const copy = [...prev];
            copy[cropTarget] = { dataUrl, blob };
            return copy;
          });
          cancelCrop();
        },
        "image/png"
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
      const maxW = canvas.parentElement?.clientWidth || 400;
      const ratio = img.height / img.width;
      canvas.width = maxW;
      canvas.height = maxW * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw crop overlay
      if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      }
    };
    img.src = cap.dataUrl;
  }, [cropMode, cropTarget, cropRect, captures]);

  const handleDone = useCallback(async () => {
    if (captures.length === 0) return;
    setProcessing(true);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setCameraActive(false);

    const fileName = generateFileName();

    if (captures.length === 1) {
      const file = new File([captures[0].blob], `${fileName}.png`, { type: "image/png" });
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
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      onCapture(file);
    }
  }, [captures, stream, onCapture]);

  // --- Crop Mode UI ---
  if (cropMode && cropTarget !== null) {
    return (
      <div className={expanded ? "fixed inset-0 z-50 bg-background p-4 flex flex-col" : "space-y-4"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">Crop Page {cropTarget + 1}</h3>
          </div>
          <button onClick={cancelCrop} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Draw a rectangle over the area you want to keep.</p>
        <div className="relative rounded-lg overflow-hidden bg-black flex-1">
          <canvas
            ref={cropCanvasRef}
            className="w-full cursor-crosshair touch-none"
            onMouseDown={handleCropMouseDown}
            onMouseMove={handleCropMouseMove}
            onMouseUp={handleCropMouseUp}
            onTouchStart={handleCropTouchStart}
            onTouchMove={handleCropTouchMove}
            onTouchEnd={handleCropTouchEnd}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cancelCrop} className="flex-1">Cancel</Button>
          <Button onClick={applyCrop} disabled={!cropRect || cropRect.w < 10 || cropRect.h < 10} className="flex-1">
            <Check className="h-4 w-4 mr-1" />Apply Crop
          </Button>
        </div>
      </div>
    );
  }

  // --- Main Camera UI ---
  return (
    <div className={expanded ? "fixed inset-0 z-50 bg-background p-4 flex flex-col" : "space-y-4"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Camera Capture</h3>
          {captures.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {captures.length} page{captures.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>
      )}

      {/* Camera viewfinder - always rendered so ref is available */}
      <div className={`relative rounded-lg overflow-hidden bg-black ${expanded ? "flex-1" : "aspect-[3/4] max-h-[400px]"} ${!cameraActive ? "hidden" : ""}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {/* Loading overlay while video initializes */}
        {!videoReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white text-sm animate-pulse">Starting camera...</div>
          </div>
        )}
        {/* Camera controls overlay */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-4 flex items-center justify-center gap-6">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleCamera}
            className="text-white hover:bg-white/20 h-10 w-10"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>

          <button
            onClick={takePhoto}
            className="h-16 w-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-colors flex items-center justify-center"
          >
            <div className="h-12 w-12 rounded-full bg-white" />
          </button>

          <button
            onClick={toggleTorch}
            disabled={!torchSupported}
            className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
              torchOn ? "bg-yellow-400 text-black" : torchSupported ? "bg-black/50 text-white hover:bg-black/70" : "bg-black/30 text-white/40"
            }`}
          >
            <Flashlight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Captured pages strip */}
      {captures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Captured pages — take more, crop, or tap Done to scan
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {captures.map((cap, i) => (
              <div key={i} className="relative shrink-0 w-20 h-28 rounded-md overflow-hidden border border-border group">
                <img src={cap.dataUrl} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute top-0.5 left-0.5">
                  <Badge className="text-[10px] px-1 py-0 bg-black/60 text-white border-0">
                    {i + 1}
                  </Badge>
                </div>
                <div className="absolute top-0.5 right-0.5 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startCrop(i)}
                    className="bg-black/60 text-white rounded-full p-0.5"
                    title="Crop"
                  >
                    <Crop className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeCapture(i)}
                    className="bg-black/60 text-white rounded-full p-0.5"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {cameraActive && (
              <button
                onClick={takePhoto}
                className="shrink-0 w-20 h-28 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span className="text-[10px] mt-1">Add page</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {captures.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={handleDone} disabled={processing} className="flex-1">
            {processing ? (
              <span className="flex items-center gap-1">
                <ImageIcon className="h-4 w-4 animate-pulse" />
                Processing...
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
