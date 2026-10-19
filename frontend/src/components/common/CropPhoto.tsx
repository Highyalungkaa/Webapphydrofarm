import React, { useState } from 'react';
import { Leaf } from 'lucide-react';

export const CropPhoto: React.FC<{ imageUrl?: string | null; name: string }> = ({ imageUrl, name }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!imageUrl || failedUrl === imageUrl) {
    return (
      <div role="img" aria-label={`ยังไม่มีรูป${name}`} className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-emerald-100 to-lime-50 text-emerald-500">
        <Leaf className="h-9 w-9" aria-hidden="true" />
      </div>
    );
  }

  return <img src={imageUrl} alt={name} loading="lazy" onError={() => setFailedUrl(imageUrl)} className="aspect-[4/3] w-full object-cover" />;
};
