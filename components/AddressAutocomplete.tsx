import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

let mapsLoaded = false;
let mapsLoadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (mapsLoaded && window.google?.maps?.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      mapsLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&language=es`;
    script.async = true;
    script.defer = true;
    script.onload = () => { mapsLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Error al cargar Google Maps'));
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

export interface AddressSelection {
  streetAddress: string;
  city: string;
  postalCode: string;
  country: string;
  fullAddress: string;
}

interface Prediction {
  place_id: string;
  description: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  className?: string;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = 'Escribe para buscar direccion...',
  className = '',
}) => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!mapsReady) return;
    autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    geocoderRef.current = new window.google.maps.Geocoder();
  }, [mapsReady]);

  const search = useCallback((query: string) => {
    if (!autocompleteServiceRef.current || query.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    setIsLoading(true);
    autocompleteServiceRef.current.getPlacePredictions(
      { input: query, types: ['address'], language: 'es' },
      (results: any[], status: string) => {
        setIsLoading(false);
        if (status === 'OK' && results?.length) {
          const preds: Prediction[] = results.map((r) => ({
            place_id: r.place_id,
            description: r.description,
          }));
          setPredictions(preds);
          setShowDropdown(true);
        } else {
          setPredictions([]);
          setShowDropdown(false);
        }
      }
    );
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const handleSelect = (placeId: string, description: string) => {
    setPredictions([]);
    setShowDropdown(false);

    if (!geocoderRef.current) {
      onChange(description);
      onSelect({ streetAddress: description, city: '', postalCode: '', country: '', fullAddress: description });
      return;
    }

    geocoderRef.current.geocode({ placeId }, (results: any[], status: string) => {
      if (status !== 'OK' || !results?.[0]) {
        onChange(description);
        onSelect({ streetAddress: description, city: '', postalCode: '', country: '', fullAddress: description });
        return;
      }
      const place = results[0];
      let streetNumber = '';
      let route = '';
      let city = '';
      let postalCode = '';
      let country = '';

      for (const comp of place.address_components as any[]) {
        const types: string[] = comp.types;
        if (types.includes('street_number')) streetNumber = comp.long_name;
        else if (types.includes('route')) route = comp.long_name;
        else if (types.includes('locality')) city = comp.long_name;
        else if (types.includes('administrative_area_level_2') && !city) city = comp.long_name;
        else if (types.includes('postal_code')) postalCode = comp.long_name;
        else if (types.includes('country')) country = comp.long_name;
      }

      const streetAddress = [route, streetNumber].filter(Boolean).join(', ');
      const fullAddress = place.formatted_address || description;

      onChange(streetAddress || description);
      onSelect({ streetAddress: streetAddress || description, city, postalCode, country, fullAddress });
    });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          ) : (
            <MapPin className="w-4 h-4" />
          )}
        </div>
      </div>

      {showDropdown && predictions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-64 overflow-y-auto divide-y divide-slate-100">
          {predictions.map((p) => (
            <li
              key={p.place_id}
              onMouseDown={() => handleSelect(p.place_id, p.description)}
              className="flex items-start gap-2 px-3 py-2.5 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-indigo-400 shrink-0" />
              <span className="leading-snug">{p.description}</span>
            </li>
          ))}
          <li className="px-3 py-1.5 flex justify-end bg-white">
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png"
              alt="Powered by Google"
              className="h-4 opacity-70"
            />
          </li>
        </ul>
      )}
    </div>
  );
};
