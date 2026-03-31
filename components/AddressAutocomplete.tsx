import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Loader2 } from 'lucide-react';

declare global {
  interface Window { google?: any; __mapsBootstrapCb?: () => void; }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

let scriptPromise: Promise<void> | null = null;

/** Carga el SDK de Google Maps una sola vez (Places legacy — AutocompleteService) */
function loadMapsScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places?.AutocompleteService) { resolve(); return; }
    window.__mapsBootstrapCb = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&language=es&callback=__mapsBootstrapCb`;
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
    if (found) return found.long_name ?? '';
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  // PlacesService necesita un elemento DOM pero no tiene que estar visible
  const placesNodeRef = useRef<HTMLDivElement>(document.createElement('div'));
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('[AddressAutocomplete] VITE_GOOGLE_MAPS_API_KEY no está definida');
      return;
    }
    loadMapsScript()
      .then(() => {
        serviceRef.current = new window.google.maps.places.AutocompleteService();
        placesServiceRef.current = new window.google.maps.places.PlacesService(placesNodeRef.current);
        setReady(true);
      })
      .catch(console.error);
  }, []);

  const ensureToken = () => {
    const Token = window.google?.maps?.places?.AutocompleteSessionToken;
    if (Token && !sessionTokenRef.current) {
      sessionTokenRef.current = new Token();
    }
  };

  /** Calcula la posición del desplegable relativa al viewport (para position:fixed) */
  const computeDropdownStyle = (): React.CSSProperties => {
    if (!inputRef.current) return {};
    const rect = inputRef.current.getBoundingClientRect();
    return {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
    };
  };

  const search = useCallback((query: string) => {
    if (!serviceRef.current || query.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    ensureToken();
    setIsLoading(true);
    serviceRef.current.getPlacePredictions(
      {
        input: query,
        language: 'es',
        types: ['address'],
        sessionToken: sessionTokenRef.current,
      },
      (results: any[] | null, status: string) => {
        setIsLoading(false);
        const OK = window.google?.maps?.places?.PlacesServiceStatus?.OK;
        if (status === OK && results?.length) {
          setPredictions(
            results.map((p: any) => ({
              placeId: p.place_id,
              description: p.description,
            }))
          );
          setDropdownStyle(computeDropdownStyle());
          setShowDropdown(true);
        } else {
          setPredictions([]);
          setShowDropdown(false);
        }
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const handleSelect = (pred: Prediction) => {
    setPredictions([]);
    setShowDropdown(false);

    if (!placesServiceRef.current) {
      onChange(pred.description);
      onSelect({ streetAddress: pred.description, city: '', province: '', postalCode: '', country: '', fullAddress: pred.description });
      return;
    }

    placesServiceRef.current.getDetails(
      {
        placeId: pred.placeId,
        fields: ['address_components', 'formatted_address'],
        sessionToken: sessionTokenRef.current,
      },
      (result: any, status: string) => {
        sessionTokenRef.current = null;
        const OK = window.google?.maps?.places?.PlacesServiceStatus?.OK;
        if (status === OK && result) {
          const comps: any[] = result.address_components ?? [];
          const route         = getComp(comps, 'route');
          const streetNumber  = getComp(comps, 'street_number');
          const city          = getComp(comps, 'locality', 'sublocality_level_1', 'administrative_area_level_3');
          const province      = getComp(comps, 'administrative_area_level_2', 'administrative_area_level_1');
          const postalCode    = getComp(comps, 'postal_code');
          const country       = getComp(comps, 'country');
          const fullAddress   = result.formatted_address ?? pred.description;
          const streetAddress = [route, streetNumber].filter(Boolean).join(', ');

          onChange(streetAddress || pred.description);
          onSelect({ streetAddress: streetAddress || pred.description, city, province, postalCode, country, fullAddress });
        } else {
          console.error('[AddressAutocomplete] getDetails error:', status);
          onChange(pred.description);
          onSelect({ streetAddress: pred.description, city: '', province: '', postalCode: '', country: '', fullAddress: pred.description });
        }
      }
    );
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

  // El dropdown se renderiza en document.body para escapar cualquier overflow:hidden/auto de los modales
  const dropdown =
    showDropdown && predictions.length > 0
      ? createPortal(
          <ul
            style={dropdownStyle}
            className="bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100"
          >
            {predictions.map((p) => (
              <li
                key={p.placeId}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
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
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => {
            if (predictions.length > 0) {
              setDropdownStyle(computeDropdownStyle());
              setShowDropdown(true);
            }
          }}
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
      {dropdown}
    </div>
  );
};
