import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

declare global {
  interface Window { google?: any; __mapsBootstrapCb?: () => void; }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

let scriptPromise: Promise<void> | null = null;

/** Carga el SDK de Google Maps una sola vez (v=weekly da acceso a la nueva Places API) */
function loadMapsScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    // Ya cargado
    if (window.google?.maps?.places?.AutocompleteSuggestion) { resolve(); return; }
    window.__mapsBootstrapCb = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&v=weekly&language=es&callback=__mapsBootstrapCb`;
    s.async = true;
    s.defer = true;
    s.onerror = () => { scriptPromise = null; reject(new Error('Error al cargar Google Maps')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface AddressSelection {
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  fullAddress: string;
}

interface Prediction {
  placeId: string;
  description: string;
  _raw: any; // PlacePrediction object
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  className?: string;
}

function getComp(components: any[], ...types: string[]): string {
  for (const t of types) {
    const found = components.find((c: any) => c.types?.includes(t));
    if (found) return found.longText ?? found.long_name ?? '';
  }
  return '';
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = 'Escribe para buscar dirección...',
  className = '',
}) => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('[AddressAutocomplete] VITE_GOOGLE_MAPS_API_KEY no está definida');
      return;
    }
    loadMapsScript()
      .then(() => setReady(true))
      .catch(console.error);
  }, []);

  const ensureToken = () => {
    const Token = window.google?.maps?.places?.AutocompleteSessionToken;
    if (Token && !sessionTokenRef.current) {
      sessionTokenRef.current = new Token();
    }
  };

  const search = useCallback(async (query: string) => {
    const AC = window.google?.maps?.places?.AutocompleteSuggestion;
    if (!AC || query.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    ensureToken();
    setIsLoading(true);
    try {
      const { suggestions } = await AC.fetchAutocompleteSuggestions({
        input: query,
        language: 'es',
        includedPrimaryTypes: ['address'],
        sessionToken: sessionTokenRef.current,
      });
      if (suggestions?.length) {
        setPredictions(
          suggestions.map((s: any) => ({
            placeId: s.placePrediction.placeId,
            description: s.placePrediction.text.text,
            _raw: s.placePrediction,
          }))
        );
        setShowDropdown(true);
      } else {
        setPredictions([]);
        setShowDropdown(false);
      }
    } catch (err) {
      console.error('[AddressAutocomplete] fetchAutocompleteSuggestions:', err);
      setPredictions([]);
      setShowDropdown(false);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const handleSelect = async (pred: Prediction) => {
    setPredictions([]);
    setShowDropdown(false);

    if (!pred._raw) {
      onChange(pred.description);
      onSelect({ streetAddress: pred.description, city: '', province: '', postalCode: '', country: '', fullAddress: pred.description });
      return;
    }

    try {
      const place = pred._raw.toPlace();
      // fetchFields consume el session token → autocomplete + details = 1 llamada facturada
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });
      sessionTokenRef.current = null; // invalidar tras usar

      const comps: any[] = place.addressComponents ?? [];
      const route         = getComp(comps, 'route');
      const streetNumber  = getComp(comps, 'street_number');
      const city          = getComp(comps, 'locality', 'sublocality_level_1', 'administrative_area_level_3');
      const province      = getComp(comps, 'administrative_area_level_2', 'administrative_area_level_1');
      const postalCode    = getComp(comps, 'postal_code');
      const country       = getComp(comps, 'country');
      const fullAddress   = place.formattedAddress ?? pred.description;
      const streetAddress = [route, streetNumber].filter(Boolean).join(', ');

      onChange(streetAddress || pred.description);
      onSelect({ streetAddress: streetAddress || pred.description, city, province, postalCode, country, fullAddress });
    } catch (err) {
      console.error('[AddressAutocomplete] fetchFields:', err);
      onChange(pred.description);
      onSelect({ streetAddress: pred.description, city: '', province: '', postalCode: '', country: '', fullAddress: pred.description });
      sessionTokenRef.current = null;
    }
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
              key={p.placeId}
              onMouseDown={() => handleSelect(p)}
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
