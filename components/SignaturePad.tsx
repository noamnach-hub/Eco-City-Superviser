import React, { useRef, useEffect, useState } from 'react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Set resolution
      const ratio = Math.ceil(window.devicePixelRatio || 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
    }
  }, []);

  const getCoordinates = (event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = (event as React.MouseEvent).clientX;
      clientY = (event as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasSignature) setHasSignature(true);
    }
  };

  const endDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
    }
  };

  const handleSave = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white w-full h-64 touch-none relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
            <span className="text-gray-400 text-lg">יש לחתום כאן</span>
          </div>
        )}
      </div>

      <div className="flex w-full justify-between mt-4 gap-3">
        <button
          onClick={clearCanvas}
          className="px-4 py-2 text-sm text-gray-600 hover:text-red-500 transition-colors"
        >
          נקה
        </button>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={!hasSignature}
            className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
              hasSignature ? 'bg-ecogreen-600 hover:bg-ecogreen-700 shadow-md' : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            אשר חתימה
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;
