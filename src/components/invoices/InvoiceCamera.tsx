import React, { useRef, useState, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, Trash2, Plus, ImageIcon } from "lucide-react";
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
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    try {
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 2560 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
      setError(null);
    } catch (err) {
      console.error("Camera error:", err);
      setError("Could not access camera. Please ensure camera permissions are granted.");
    }
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
    startCamera(next);
  };

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
        setCaptures((prev) => [...prev, { dataUrl, blob }]);
      },
      "image/jpeg",
      0.92
    );
  }, []);

  const removeCapture = (index: number) => {
    setCaptures((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDone = useCallback(async () => {
    if (captures.length === 0) return;
    setProcessing(true);

    // Stop camera
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setCameraActive(false);

    const fileName = generateFileName();

    if (captures.length === 1) {
      // Single photo → send as JPEG
      const file = new File([captures[0].blob], `${fileName}.jpg`, { type: "image/jpeg" });
      onCapture(file);
    } else {
      // Multiple photos → combine into a single tall image
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
  }, [captures, stream, onCapture]);

  return (
    <div className="space-y-4">
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
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>
      )}

      {/* Camera viewfinder */}
      {cameraActive && (
        <div className="relative rounded-lg overflow-hidden bg-black aspect-[3/4] max-h-[400px]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
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
            <div className="w-10" /> {/* spacer */}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Captured pages strip */}
      {captures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Captured pages — take more or tap Done to scan
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
                <button
                  onClick={() => removeCapture(i)}
                  className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
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
